const IMAGE_UPLOAD_ENDPOINT = "https://api.weixin.qq.com/cgi-bin/material/add_material";
const DRAFT_CREATE_ENDPOINT = "https://api.weixin.qq.com/cgi-bin/draft/add";

export function buildWeChatContent({ formatted, translation }, uploads = []) {
  const uploadsList = Array.isArray(uploads) ? uploads : [];
  const sourceHtml = typeof formatted?.html === "string" ? formatted.html.trim() : "";
  const fallback = typeof translation?.text === "string" ? translation.text.trim() : "";
  let content = sourceHtml || fallback;
  if (!content) {
    return "<article></article>";
  }
  if (uploadsList.length) {
    content = replaceImageSources(content, uploadsList);
  }
  return content;
}

export async function uploadImagesForWeChat(images, { accessToken, dryRun }) {
  if (!Array.isArray(images) || !images.length) {
    return [];
  }
  const results = [];
  for (const image of images) {
    const localSrc = image.dataUrl || image.url || "";
    if (!localSrc) {
      continue;
    }
    if (dryRun || !accessToken) {
      results.push({
        ...image,
        remoteUrl: localSrc,
        localSrc,
        dryRun: true,
        mediaId: `<dry-run:${buildFilename(image)}>`,
      });
      continue;
    }
    const blob = await toBlob(localSrc);
    const formData = new FormData();
    formData.append("media", blob, buildFilename(image));
    const endpoint = new URL(IMAGE_UPLOAD_ENDPOINT);
    endpoint.searchParams.set("access_token", accessToken);
    endpoint.searchParams.set("type", "image");
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      body: formData,
    });
    let json = null;
    try {
      json = await response.json();
    } catch (error) {
      throw new Error("上传图片响应解析失败");
    }
    const errcode = json?.errcode ?? null;
    if (!response.ok || errcode) {
      const message = json?.errmsg || `上传失败(${response.status})`;
      const wrapped = new Error(`${message}${errcode ? `（errcode=${errcode}）` : ""}`);
      wrapped.errcode = errcode ?? response.status;
      wrapped.errmsg = json?.errmsg ?? message;
      throw wrapped;
    }
    if (!json?.url || !json?.media_id) {
      throw new Error("上传成功但缺少 URL 或 media_id");
    }
    results.push({
      ...image,
      remoteUrl: json.url,
      localSrc,
      mediaId: json.media_id,
      dryRun: false,
    });
  }
  return results;
}

export async function createWeChatDraft(
  { formatted, translation, metadata, sourceUrl },
  uploads,
  { accessToken, dryRun },
) {
  const articleHtml = buildWeChatContent({ formatted, translation }, uploads);
  const digest = typeof metadata?.digest === "string"
    ? prepareDigest(metadata.digest)
    : "";
  const thumbMediaId =
    metadata?.thumbMediaId ||
    (uploads && uploads.length > 0 ? uploads[0]?.mediaId || "" : "") ||
    "";
  if (!thumbMediaId && !dryRun && accessToken) {
    throw new Error("缺少封面素材 ID，无法创建草稿");
  }
  const payload = {
    articles: [
      {
        article_type: "news",
        title: metadata?.title || deriveTitle(translation?.text || formatted?.markdown || ""),
        author: metadata?.author || "",
        content: articleHtml,
        digest,
        content_source_url: (metadata?.sourceUrl || sourceUrl || "").trim(),
        need_open_comment: metadata?.needOpenComment ? 1 : 0,
        only_fans_can_comment: metadata?.onlyFansCanComment ? 1 : 0,
      },
    ],
  };
  if (thumbMediaId) {
    payload.articles[0].thumb_media_id = thumbMediaId;
  }

  if (dryRun || !accessToken) {
    return {
      media_id: "<dry-run>",
      payload,
      uploads,
      dryRun: true,
    };
  }

  const endpoint = new URL(DRAFT_CREATE_ENDPOINT);
  endpoint.searchParams.set("access_token", accessToken);
  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let json = null;
  try {
    json = await response.json();
  } catch (error) {
    throw new Error("草稿响应解析失败");
  }
  const errcode = json?.errcode ?? null;
  if (!response.ok || errcode || !json?.media_id) {
    const message = json?.errmsg || `草稿创建失败(${response.status})`;
    const wrapped = new Error(`${message}${errcode ? `（errcode=${errcode}）` : ""}`);
    wrapped.errcode = errcode ?? response.status;
    wrapped.errmsg = json?.errmsg ?? message;
    throw wrapped;
  }
  return {
    media_id: json.media_id,
    payload,
    uploads,
    dryRun: false,
  };
}

function buildFilename(image) {
  const sequence = image.sequence ? String(image.sequence).padStart(3, "0") : Date.now();
  return `image_${sequence}.jpg`;
}

async function toBlob(src) {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`无法读取图片数据(${response.status})`);
  }
  return response.blob();
}

function replaceImageSources(html, uploads) {
  if (!uploads || !uploads.length) {
    return html;
  }
  let output = html;
  for (const upload of uploads) {
    if (!upload?.remoteUrl || !upload?.localSrc) continue;
    output = output.split(upload.localSrc).join(upload.remoteUrl);
  }
  return output;
}

function prepareDigest(text) {
  if (!text) return "";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(text);
  if (bytes.length <= 256) {
    return text;
  }
  let truncated = bytes.slice(0, 256);
  while (truncated.length && (truncated[truncated.length - 1] & 0xC0) === 0x80) {
    truncated = truncated.slice(0, -1);
  }
  return decoder.decode(truncated);
}

function deriveTitle(text) {
  if (!text) return "待确认标题";
  const firstLine = text.split(/\r?\n/).find((line) => line.trim());
  return firstLine?.slice(0, 60) || "待确认标题";
}
