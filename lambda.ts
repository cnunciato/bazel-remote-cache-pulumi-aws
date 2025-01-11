import * as lambda from "aws-lambda";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const role = new aws.iam.Role(`auth-lambda-role`, {
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

const rolePolicyAttachment = new aws.iam.RolePolicyAttachment(
    `auth-lambda-policy-attachment`,
    {
        role,
        policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
    },
);

export const getAuthLambda = (
    user: pulumi.Output<string>,
    pass: pulumi.Output<string>,
) => {
    return pulumi.all([user, pass]).apply(([u, p]) => {
        return new aws.lambda.CallbackFunction(
            `auth-lambda-function`,
            {
                publish: true,
                role,
                timeout: 5,
                callback: async (event: lambda.CloudFrontRequestEvent) => {
                    const expectedAuth =
                        "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
                    const request = event.Records[0].cf.request;
                    const headers = request.headers;

                    if (
                        headers.authorization &&
                        headers.authorization[0].value === expectedAuth
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
                provider: new aws.Provider("us-east-1", {
                    region: "us-east-1",
                }),
            },
        );
    });
};
