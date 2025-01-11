import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as lambdas from "./lambda";

// Fetch the basic-auth username and password as secrets from Pulumi config.
const config = new pulumi.Config();
const username = config.requireSecret("username");
const password = config.requireSecret("password");

// Provision an S3 bucket to hold the Bazel cache.
const bucket = new aws.s3.Bucket("bazel-remote-cache", {
    forceDestroy: true,
});

// Provision an origin access identity to restrict access to the bucket.
const oid = new aws.cloudfront.OriginAccessIdentity("cloudfront-oai", {
    comment: pulumi.interpolate`oai-${bucket.bucketDomainName}`,
});

// Grant read, write, and list permissions to CloudFront for the bucket and its objects.
const bucketPolicy = new aws.s3.BucketPolicy("bucket-policy", {
    bucket: bucket.id,
    policy: pulumi.jsonStringify({
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Principal: {
                    AWS: oid.iamArn,
                },
                Action: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
                Resource: [bucket.arn, pulumi.interpolate`${bucket.arn}/*`],
            },
        ],
    }),
});

// Provision a CloudFront distribution and protect it with basic auth.
const cdn = new aws.cloudfront.Distribution("cdn", {
    origins: [
        {
            originId: bucket.arn,
            domainName: bucket.bucketRegionalDomainName,
            s3OriginConfig: {
                originAccessIdentity: oid.cloudfrontAccessIdentityPath,
            },
        },
    ],
    defaultCacheBehavior: {
        targetOriginId: bucket.arn,
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: [
            "GET",
            "HEAD",
            "OPTIONS",
            "PUT",
            "POST",
            "PATCH",
            "DELETE",
        ],
        cachedMethods: ["GET", "HEAD"],
        forwardedValues: {
            queryString: false,
            cookies: {
                forward: "none",
            },
        },
        // Only provision the edge Lambda if a username and password were provided.
        lambdaFunctionAssociations:
            username && password
                ? [
                      {
                          eventType: "viewer-request",
                          lambdaArn: pulumi.interpolate`${lambdas.getAuthLambda(username, password).qualifiedArn}`,
                      },
                  ]
                : undefined,
    },
    enabled: true,
    isIpv6Enabled: true,
    restrictions: {
        geoRestriction: {
            restrictionType: "none",
        },
    },
    viewerCertificate: {
        cloudfrontDefaultCertificate: true,
    },
});

export const url = pulumi.interpolate`https://${username}:${password}@${cdn.domainName}`;
