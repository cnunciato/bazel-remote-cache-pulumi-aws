# bazel-remote-cache-pulumi-aws

A [Pulumi](https://www.pulumi.com/docs/) template that deploys a [Bazel remote cache](https://bazel.build/remote/caching) powered by Amazon S3 and CloudFront. Optionally supports HTTP basic authentication, and available for both Node.js (TypeScript, JavaScript) and Python.

## Usage

Create a new project with `pulumi new` by pointing to this repository, then follow the prompts. If you want the endpoint to be protected with HTTP basic auth, set a username and password; otherwise, you can leave them blank to leave the endpoint unprotected.

### Node.js (TypeScript, JavaScript)

```bash
pulumi new https://github.com/cnunciato/bazel-remote-cache-pulumi-aws/tree/main/python
```

### Python

```bash
pulumi new https://github.com/cnunciato/bazel-remote-cache-pulumi-aws/tree/main/typescript
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

Finally, to use the cache with your Bazel-managed project, pass the `url` with [`--remote_cache`](https://bazel.build/remote/caching#read-write-remote-cache) (or set it in your local `.bazelrc`):

```bash
bazel test //... --remote_cache $(pulumi stack output url --show-secrets --stack org/project/stack)
```

To tear everything down (including all S3 data):

```bash
pulumi destroy
```

Enjoy! :rocket:

## Configuration settings

| Key        | Description                                 | Type     |
| ---------- | ------------------------------------------- | -------- |
| `username` | The username for HTTP basic auth (optional) | `string` |
| `password` | The password for HTTP basic auth (optional) | `string` |
