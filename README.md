

`python3 tools/encode.py --in_dir raw --out_dir enc --key "your-long-ish-key"`

`node tools/xor-encode.mjs images encrypted "your-xor-key"`

`deno task build:gallery --key "KEY"`

```
cdn.jsdelivr.net/.../{version}/{file}
https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/enc/cat01.jpg.bin
https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/manifest.json
```
