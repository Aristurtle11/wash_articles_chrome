const IMAGE_UPLOAD_ENDPOINT = "https://api.weixin.qq.com/cgi-bin/media/uploadimg";
const DRAFT_CREATE_ENDPOINT = "https://api.weixin.qq.com/cgi-bin/draft/add";

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
      results.push({ ...image, remoteUrl: localSrc, localSrc, dryRun: true });
      continue;
    }
    const blob = await toBlob(localSrc);
    const formData = new FormData();
    formData.append("media", blob, buildFilename(image));
    const endpoint = new URL(IMAGE_UPLOAD_ENDPOINT);
    endpoint.searchParams.set("access_token", accessToken);
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      body: formData,
    });
    const json = await response.json();
    if (!response.ok || !json?.url) {
      const message = json?.errmsg || `上传失败(${response.status})`;
      throw new Error(message);
    }
    results.push({ ...image, remoteUrl: json.url, localSrc, dryRun: false });
  }
  return results;
}

export async function createWeChatDraft(
  { formatted, translation, metadata, sourceUrl },
  uploads,
  { accessToken, dryRun },
) {
  const articleHtml = replaceImageSources(formatted?.html || translation?.text || "", uploads);
  const digest = metadata?.digest || buildDigest(translation?.text || "");
  const payload = {
    articles: [
      {
        title: metadata?.title || deriveTitle(translation?.text || formatted?.markdown || ""),
        author: metadata?.author || "",
        content: articleHtml,
        digest,
        content_source_url: metadata?.sourceUrl || sourceUrl || "",
        need_open_comment: metadata?.needOpenComment ? 1 : 0,
        only_fans_can_comment: metadata?.onlyFansCanComment ? 1 : 0,
        thumb_media_id: metadata?.thumbMediaId || "",
      },
    ],
  };

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
  const json = await response.json();
  if (!response.ok || !json?.media_id) {
    const message = json?.errmsg || `草稿创建失败(${response.status})`;
    throw new Error(message);
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

function buildDigest(text) {
  if (!text) return "";
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.slice(0, 120);
}

function deriveTitle(text) {
  if (!text) return "待确认标题";
  const firstLine = text.split(/\r?\n/).find((line) => line.trim());
  return firstLine?.slice(0, 60) || "待确认标题";
}
