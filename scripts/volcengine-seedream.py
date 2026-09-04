#!/usr/bin/env python3
"""Server-side bridge for Volcengine Ark Seedream image generation."""

import json
import os
import sys


def fail(message: str, code: int = 1) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False), file=sys.stderr)
    raise SystemExit(code)


try:
    from volcenginesdkarkruntime import Ark
except ImportError:
    fail(
        "未安装 volcengine-python-sdk[ark]，请在项目虚拟环境中运行 pip install --upgrade \"volcengine-python-sdk[ark]\"",
        78,
    )


def main() -> None:
    if "--check" in sys.argv:
        print(json.dumps({"ok": True, "sdk": "volcengine-python-sdk[ark]"}))
        return

    api_key = os.environ.get("ARK_API_KEY")
    if not api_key:
        fail("ARK_API_KEY 未配置")

    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        fail(f"Seedream SDK 输入不是有效 JSON：{error}")

    model = str(payload.get("model") or "").strip()
    prompt = str(payload.get("prompt") or "").strip()
    if not model:
        fail("Seedream 模型 ID 不能为空")
    if not prompt:
        fail("Seedream Prompt 不能为空")

    images = payload.get("image")
    kwargs = {
        "model": model,
        "prompt": prompt,
        "response_format": "url",
        "size": "2K",
        "stream": False,
        "watermark": True,
        "sequential_image_generation": "disabled",
    }
    if isinstance(images, str) and images:
        kwargs["image"] = images
    elif isinstance(images, list) and images:
        kwargs["image"] = images
    if isinstance(payload.get("seed"), int):
        kwargs["seed"] = payload["seed"]

    try:
        client = Ark(
            base_url=os.environ.get(
                "ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"
            ),
            api_key=api_key,
        )
        response = client.images.generate(**kwargs)
        item = response.data[0] if response.data else None
        if item is None or (not getattr(item, "url", None) and not getattr(item, "b64_json", None)):
            fail("Seedream SDK 响应中没有图片")
        print(
            json.dumps(
                {
                    "data": [
                        {
                            "url": getattr(item, "url", None),
                            "b64_json": getattr(item, "b64_json", None),
                        }
                    ]
                },
                ensure_ascii=False,
            )
        )
    except SystemExit:
        raise
    except Exception as error:
        fail(f"Seedream SDK 调用失败：{error}")


if __name__ == "__main__":
    main()
