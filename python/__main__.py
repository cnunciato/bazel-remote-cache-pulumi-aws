import pulumi
import pulumi_aws as aws

# Fetch the basic-auth username and password as secrets from Pulumi config.
# These are optional.
config = pulumi.Config()
username = config.get_secret("username")
password = config.get_secret("password")

# Provision an S3 bucket to hold the Bazel cache.
bucket = aws.s3.Bucket("bazel-remote-cache", force_destroy=True)

# Provision an origin access identity to grant CloudFront access to the bucket.
oai = aws.cloudfront.OriginAccessIdentity("cloudfront-oai")

# Grant read, write, and list permissions to CloudFront for the bucket and its objects.
bucket_policy = aws.s3.BucketPolicy(
    "bucket-policy",
    bucket=bucket.id,
    policy=pulumi.Output.all(bucket.arn, oai.iam_arn).apply(
        lambda args: {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "AWS": args[1],
                    },
                    "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
                    "Resource": [args[0], f"{args[0]}/*"],
                }
            ],
        }
    ),
)

# Create an IAM role with assume-role permissions.
role = aws.iam.Role(
    "auth-lambda-role",
    assume_role_policy={
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": "sts:AssumeRole",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Effect": "Allow",
            },
            {
                "Action": "sts:AssumeRole",
                "Principal": {"Service": "edgelambda.amazonaws.com"},
                "Effect": "Allow",
            },
        ],
    },
)

# Attach the AWS Lambda basic execution policy to the role.
role_policy_attachment = aws.iam.RolePolicyAttachment(
    "auth-lambda-policy-attachment",
    role=role.name,
    policy_arn=aws.iam.ManagedPolicy.AWS_LAMBDA_BASIC_EXECUTION_ROLE,
)


# Provide a function defining the edge Lambda.
def get_auth_lambda(user: pulumi.Output[str], pass_: pulumi.Output[str]):
    return pulumi.Output.all(user, pass_).apply(
        lambda args: aws.lambda_.Function(
            "auth-lambda-function",
            role=role.arn,
            publish=True,
            runtime="python3.9",
            handler="handler.handler",
            code=pulumi.FileArchive("./function"),
            # Edge Lambdas must be provisioned in us-east-1.
            opts=pulumi.ResourceOptions(
                provider=aws.Provider("us-east-1", region="us-east-1"),
            ),
        )
    )


# Provision a CloudFront distribution and protect it with basic auth.
cdn = aws.cloudfront.Distribution(
    "cdn",
    origins=[
        {
            "originId": bucket.arn,
            "domainName": bucket.bucket_regional_domain_name,
            "s3OriginConfig": {
                "originAccessIdentity": oai.cloudfront_access_identity_path,
            },
            "custom_headers": (
                [
                    {
                        "name": "X-Basic-Auth-Username",
                        "value": username,
                    },
                    {
                        "name": "X-Basic-Auth-Password",
                        "value": password,
                    },
                ]
                if username and password
                else None
            ),
        }
    ],
    default_cache_behavior={
        "targetOriginId": bucket.arn,
        "viewerProtocolPolicy": "redirect-to-https",
        "allowedMethods": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
        "cachedMethods": ["GET", "HEAD"],
        "forwardedValues": {
            "queryString": False,
            "cookies": {"forward": "none"},
        },
        # Only provision the edge Lambda if a username and password were provided.
        "lambdaFunctionAssociations": pulumi.Output.all(username, password).apply(
            lambda args: (
                [
                    {
                        "eventType": "origin-request",
                        "lambdaArn": get_auth_lambda(args[0], args[1]).qualified_arn,
                    }
                ]
                if args[0] and args[1]
                else None
            )
        ),
    },
    enabled=True,
    is_ipv6_enabled=True,
    restrictions={
        "geoRestriction": {
            "restrictionType": "none",
        },
    },
    viewer_certificate={
        "cloudfrontDefaultCertificate": True,
    },
)

# Export the public URL.
url = pulumi.Output.all(username, password, cdn.domain_name).apply(
    lambda args: (
        f"https://{args[0]}:{args[1]}@{args[2]}"
        if args[0] and args[1]
        else f"https://{args[2]}"
    )
)

pulumi.export("url", url)
