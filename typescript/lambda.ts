import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as lambda from "aws-lambda";

// Create an IAM role with assume-role permissions.
const role = new aws.iam.Role("auth-lambda-role", {
    assumeRolePolicy: {
        Version: "2012-10-17",
        Statement: [
            {
                Action: "sts:AssumeRole",
                Principal: aws.iam.Principals.LambdaPrincipal,
                Effect: "Allow",
            },
            {
                Action: "sts:AssumeRole",
                Principal: aws.iam.Principals.EdgeLambdaPrincipal,
                Effect: "Allow",
            },
        ],
    },
});

// Attach the AWS Lambda basic execution policy to the role.
const rolePolicyAttachment = new aws.iam.RolePolicyAttachment("auth-lambda-policy-attachment", {
    role,
    policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
});

// Export a function defining the edge Lambda. We do it this way (i.e., as a
// function with .apply(), as opposed to just exposing the resource) because the
// username and password are exposed as Pulumi outputs, and those outputs must
// be resolved as plain strings before they can be serialized into the Lambda
// function body.
export const getAuthLambda = (user: pulumi.Output<string>, pass: pulumi.Output<string>) => {
    return pulumi.all([user, pass]).apply(([u, p]) => {
        return new aws.lambda.CallbackFunction(
            "auth-lambda-function",
            {
                publish: true,
                role,
                timeout: 5,
                callback: async (event: lambda.CloudFrontRequestEvent) => {
                    const request = event.Records[0].cf.request;
                    const headers = request.headers;
                    const auth = headers.authorization;

                    if (auth) {
                        const decoded = Buffer.from(auth[0].value.split("Basic ")[1], "base64")
                            .toString("utf-8")
                            .split(":");

                        const username = decoded[0];
                        const password = decoded[1];

                        if (username === u && password === p) {
                            return request;
                        }
                    }

                    return {
                        status: "401",
                        statusDescription: "Unauthorized",
                        headers: {
                            "www-authenticate": [{ key: "WWW-Authenticate", value: "Basic" }],
                        },
                    };
                },
            },
            {
                // Edge Lambdas must be provisioned in us-east-1.
                provider: new aws.Provider("us-east-1", {
                    region: "us-east-1",
                }),
            },
        );
    });
};
