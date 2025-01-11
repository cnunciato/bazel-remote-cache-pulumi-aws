import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as lambdas from "./lambda";

const config = new pulumi.Config();
const username = config.requireSecret("username");
const password = config.requireSecret("password");

const bucket = new aws.s3.Bucket("bazel-remote-cache", {
    forceDestroy: true,
});

const oid = new aws.cloudfront.OriginAccessIdentity("cloudfront-oid", {
    comment: pulumi.interpolate`oai-${bucket.bucketDomainName}`,
});

const bucketPolicy = new aws.s3.BucketPolicy("bucketPolicy", {
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
        lambdaFunctionAssociations: [
            {
                eventType: "viewer-request",
                lambdaArn: pulumi.interpolate`${lambdas.getAuthLambda(username, password).qualifiedArn}`,
            },
        ],
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

export const cacheURL = pulumi.interpolate`https://${username}:${password}@${cdn.domainName}`;
