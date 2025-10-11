import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createWeChatDraft, uploadImagesForWeChat } from "./wechat_service.js";

describe("wechat_service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("uploadImagesForWeChat", () => {
    it("uploads images to permanent material endpoint and returns mediaId", async () => {
      const blobResponse = {
        ok: true,
        blob: async () => new Blob(["test"], { type: "image/jpeg" }),
      };
      const apiResponse = {
        ok: true,
        json: async () => ({ url: "https://wx/img.jpg", media_id: "MEDIA_ID_1" }),
      };
      fetch.mockResolvedValueOnce(blobResponse);
      fetch.mockResolvedValueOnce(apiResponse);

      const images = [{ dataUrl: "data:image/png;base64,AA==", sequence: 1 }];
      const result = await uploadImagesForWeChat(images, { accessToken: "token", dryRun: false });

      expect(fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("material/add_material"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].mediaId).toBe("MEDIA_ID_1");
      expect(result[0].remoteUrl).toBe("https://wx/img.jpg");
    });

    it("throws with errcode info when upload rejected", async () => {
      const blobResponse = {
        ok: true,
        blob: async () => new Blob(["test"], { type: "image/jpeg" }),
      };
      const apiResponse = {
        ok: true,
        json: async () => ({ errcode: 40164, errmsg: "invalid ip" }),
      };
      fetch.mockResolvedValueOnce(blobResponse);
      fetch.mockResolvedValueOnce(apiResponse);

      await expect(
        uploadImagesForWeChat([{ dataUrl: "data:image/png;base64,AA==", sequence: 1 }], {
          accessToken: "token",
          dryRun: false,
        }),
      ).rejects.toMatchObject({ errcode: 40164 });
    });
  });

  describe("createWeChatDraft", () => {
    it("uses first uploaded mediaId as thumb when not supplied", async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ media_id: "MEDIA_DRAFT_1" }),
      });
      const uploads = [
        {
          localSrc: "data:image/png;base64,AA==",
          remoteUrl: "https://wx/img.jpg",
          mediaId: "MEDIA_ID_1",
        },
      ];
      const result = await createWeChatDraft(
        {
          formatted: { html: "<p>内容</p>" },
          translation: { text: "内容" },
          metadata: { title: "标题" },
          sourceUrl: "https://example.com",
        },
        uploads,
        { accessToken: "token", dryRun: false },
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("draft/add?access_token=token"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(result.payload.articles[0].thumb_media_id).toBe("MEDIA_ID_1");
      expect(result.media_id).toBe("MEDIA_DRAFT_1");
    });

    it("propagates errcode on draft creation failure", async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 40001, errmsg: "invalid credential" }),
      });
      await expect(
        createWeChatDraft(
          {
            formatted: { html: "<p>内容</p>" },
            translation: { text: "内容" },
            metadata: { title: "标题" },
            sourceUrl: "https://example.com",
          },
          [{ localSrc: "data:", remoteUrl: "https://wx/img.jpg", mediaId: "MEDIA_ID_1" }],
          { accessToken: "token", dryRun: false },
        ),
      ).rejects.toMatchObject({ errcode: 40001 });
    });
  });
});
