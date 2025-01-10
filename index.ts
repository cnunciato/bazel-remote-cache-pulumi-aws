import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const s3Bucket = new aws.s3.Bucket("bazel-remote-cache", {
    forceDestroy: true,
});

const originAccessIdentity = new aws.cloudfront.OriginAccessIdentity("cloudfront", {
    comment: pulumi.interpolate`OAI-${s3Bucket.bucketDomainName}`,
});

const bucketPolicy = new aws.s3.BucketPolicy("bucketPolicy", {
    bucket: s3Bucket.id,
    policy: pulumi.jsonStringify({
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Principal: {
                    AWS: originAccessIdentity.iamArn,
                },
                Action: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
                Resource: [
                    s3Bucket.arn,
                    pulumi.interpolate`${s3Bucket.arn}/*`,
                ],
            },
        ],
    }),
});

const cloudFrontDistribution = new aws.cloudfront.Distribution("bazel-remote-cache-cdn", {
    origins: [
        {
            originId: s3Bucket.arn,
            domainName: s3Bucket.bucketRegionalDomainName,
            s3OriginConfig: {
                originAccessIdentity: originAccessIdentity.cloudfrontAccessIdentityPath,
            },
        },
    ],
    defaultCacheBehavior: {
        targetOriginId: s3Bucket.arn,
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
        cachedMethods: ["GET", "HEAD"],
        forwardedValues: {
            queryString: false,
            cookies: {
                forward: "none",
            },
        },
        // lambdaFunctionAssociations: [
        //     {
        //         eventType: "viewer-request",
        //         lambdaArn: "<Your Lambda@Edge ARN>", // Replace with actual Lambda@Edge function ARN
        //     },
        // ],
    },
    enabled: true,
    isIpv6Enabled: true,
    // defaultRootObject: "",
    restrictions: {
        geoRestriction: {
            restrictionType: "none",
        },
    },
    viewerCertificate: {
        cloudfrontDefaultCertificate: true,
    },
});

export const cacheURL = pulumi.interpolate`https://${cloudFrontDistribution.domainName}`;