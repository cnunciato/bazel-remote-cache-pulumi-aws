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

// EFS File System
const fileSystem = new aws.efs.FileSystem("efs");

const vpc = new awsx.ec2.DefaultVpc("default");

const mountTargets = vpc.publicSubnetIds.apply((subnetIds) =>
    subnetIds.map((subnetId, index) => 
        new aws.efs.MountTarget(`efs-mount-target-${index}`, {
            fileSystemId: fileSystem.id,
            subnetId: subnetId,
        })
    )
);

const service = new awsx.ecs.FargateService("service", {
    cluster: cluster.arn,
    assignPublicIp: true,
    desiredCount: 1,
    taskDefinitionArgs: {
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
                    name: "BAZEL_REMOTE_DIR",
                    value: "/data",
                },
                {
                    name: "BAZEL_REMOTE_MAX_SIZE",
                    value: "2",
                },
            ],
            mountPoints: [
                {
                    containerPath: "/data",
                    sourceVolume: "efs-data",
                },
            ],
        },
        volumes: [
            {
                name: "efs-data",
                efsVolumeConfiguration: {
                    fileSystemId: fileSystem.id,
                },
            },
        ],
    },
});

export const url = pulumi.interpolate`http://${lb.loadBalancer.dnsName}:${port}`;