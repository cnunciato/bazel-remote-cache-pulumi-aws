# bazel-remote-cache-pulumi-aws

An [Pulumi](https://www.pulumi.com/docs/) example and template that deploys a [Bazel remote cache](https://bazel.build/remote/caching) powered by Amazon S3 and CloudFront. Optionally supports HTTP basic authentication.

## Usage

Create a new project with `pulumi new` by pointing to this reposiroty, then follow the prompts to set an optional HTTP basic-auth username and password. (If you choose not to set either one, the cache will be provisioned without authentication.)

```
pulumi new https://github.com/cnunciato/bazel-remote-cache-pulumi-aws
pulumi up

...
Outputs:
    url: [secret]
```

You can obtain the generated CloudFront URL with `pulumi stack output`:

```bash
pulumi stack output url
https://somerandomhost.cloudfront.net
```

For authenticated services, you'll need to pass `--show-secrets`:

```bash
pulumi stack output url --show-secrets
https://someuser:abc123@somerandomhost.cloudfront.net
```

To use the cache with your Bazel-managed project, pass the `url` with `--remote_cache`:

```bash
bazel test //... --remote_cache $(pulumi stack output url --show-secrets --stack org/project/stack)
```

Enjoy!

## Configuration settings

| Key        | Description                                        | Type     |
| ---------- | -------------------------------------------------- | -------- |
| `username` | The username to use for HTTP basic auth (optional) | `string` |
| `password` | The username to use for HTTP basic auth (optional) | `string` |
