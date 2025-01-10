import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const config = new pulumi.Config();
const port = config.requireNumber("containerPort");

const lb = new awsx.lb.ApplicationLoadBalancer("lb", { 
    listener: { 
        port,
    },
    defaultTargetGroup: {
        healthCheck: {
            port: port.toString(),
            path: "/",
            matcher: "400",
        }
    }
});

const cluster = new aws.ecs.Cluster("cluster");

const vpc = new awsx.ec2.DefaultVpc("default");

// Create an S3 bucket for the Bazel remote cache
const s3Bucket = new aws.s3.Bucket("bazel-remote-cache", {
    forceDestroy: true, // Optional: Automatically delete bucket contents when destroying the stack
});

// Create an IAM role for the ECS task to access the S3 bucket
const taskRole = new aws.iam.Role("ecsTaskExecutionRole", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: [
            "ecs.amazonaws.com",
            "ecs-tasks.amazonaws.com",
        ],
    }),
});

// Attach an inline policy to allow S3 access to the role
new aws.iam.RolePolicy("s3AccessPolicy", {
    role: taskRole.name,
    policy: s3Bucket.arn.apply(bucketArn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
                Resource: [
                    bucketArn,
                    `${bucketArn}/*`,
                ],
            },
        ],
    })),
});

const service = new awsx.ecs.FargateService("service", {
    cluster: cluster.arn,
    assignPublicIp: true,
    desiredCount: 1,
    taskDefinitionArgs: {
        taskRole: {
            roleArn: taskRole.arn
        },
        container: {
            name: "bazel-cache",
            image: "buchgr/bazel-remote-cache",
            cpu: 128,
            memory: 512,
            essential: true,
            portMappings: [
                {
                    containerPort: port,
                    targetGroup: lb.defaultTargetGroup,
                },
            ],
            environment: [
                {
                    name: "BAZEL_REMOTE_HTTP_ADDRESS",
                    value: `0.0.0.0:${port}`,
                },
                {
                    name: "BAZEL_REMOTE_MAX_SIZE",
                    value: "2", // Max cache size in GB
                },
                {
                    name: "BAZEL_REMOTE_S3_AUTH_METHOD",
                    value: "iam_role",
                },
                {
                    name: "BAZEL_REMOTE_S3_BUCKET",
                    value: s3Bucket.bucket,
                },
                {
                    name: "BAZEL_REMOTE_S3_ENDPOINT",
                    value: `s3.${aws.config.region}.amazonaws.com`,
                }
            ],
        },
    },
});

export const url = pulumi.interpolate`http://${lb.loadBalancer.dnsName}:${port}`;
