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
const rolePolicyAttachment = new aws.iam.RolePolicyAttachment(
    "auth-lambda-policy-attachment",
    {
        role,
        policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
    },
);

// Export a function defining the edge Lambda. We do this because the username
// and password are exposed as Pulumi outputs, and those outputs must be
// resolved as plain strings before they can be serialized into the Lambda
// function body.
export const getAuthLambda = (
    user: pulumi.Output<string>,
    pass: pulumi.Output<string>,
) => {
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

                    if (
                        headers.authorization &&
                        headers.authorization[0].value ===
                            `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`
                    ) {
                        return request;
                    }

                    return {
                        status: "401",
                        statusDescription: "Unauthorized",
                        headers: {
                            "www-authenticate": [
                                { key: "WWW-Authenticate", value: "Basic" },
                            ],
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
