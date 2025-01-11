# bazel-remote-cache-pulumi-aws

A [Pulumi](https://www.pulumi.com/docs/) template that deploys a [Bazel remote cache](https://bazel.build/remote/caching) powered by Amazon S3 and CloudFront. Optionally supports HTTP basic authentication.

## Usage

Create a new project with `pulumi new` by pointing to this repository, then follow the prompts. If you want the endpoint to be protected with HTTP basic auth, set a username and password; otherwise, you can leave them blank to leave the endpoint unprotected.

```bash
pulumi new https://github.com/cnunciato/bazel-remote-cache-pulumi-aws
```

Run `pulumi up` to deploy:

```plain
pulumi up

...
Outputs:
    url: [secret]
```

To obtain the computed CloudFront URL, use `pulumi stack output`:

```bash
pulumi stack output url

https://somerandomhost.cloudfront.net
```

For protected instances, pass `--show-secrets`:

```bash
pulumi stack output url --show-secrets

https://someuser:abc123@somerandomhost.cloudfront.net
```

Finally, use the cache with your Bazel-managed project, pass the `url` with [`--remote_cache`](https://bazel.build/remote/caching#read-write-remote-cache):

```bash
bazel test //... --remote_cache $(pulumi stack output url --show-secrets --stack org/project/stack)
```

Enjoy!

## Configuration settings

| Key        | Description                                        | Type     |
| ---------- | -------------------------------------------------- | -------- |
| `username` | The username to use for HTTP basic auth (optional) | `string` |
| `password` | The password to use for HTTP basic auth (optional) | `string` |
