# 获取永久素材

[ 调试诊断](https://developers.weixin.qq.com/console/devtools/debug)

> 接口应在服务器端调用，不可在前端（小程序、网页、APP等）直接调用，具体可参考[接口调用指南](https://developers.weixin.qq.com/doc/oplatform/developers/dev/guide.html)

接口英文名：getMaterial

本接口用于根据media_id获取永久素材的详细信息



## 1. 调用方式

### HTTPS 调用

```bash
POST https://api.weixin.qq.com/cgi-bin/material/get_material?access_token=ACCESS_TOKEN
```

### 云调用

- 调用方法：officialAccount.material.get
- 出入参和 HTTPS 调用相同，调用方式可查看 [云调用](https://developers.weixin.qq.com/doc/oplatform/developers/dev/cloudCall.html) 说明文档

### 第三方调用

- 本接口支持第三方平台代商家调用。
- 该接口所属的权限集 id 为：3、11、18、30-31、100
- 服务商获得其中之一权限集授权后，可通过使用 [authorizer_access_token](https://developers.weixin.qq.com/doc/oplatform/developers/dev/AuthorizerAccessToken.html) 代商家进行调用，具体可查看 [第三方调用](https://developers.weixin.qq.com/doc/oplatform/Third-party_Platforms/2.0/api/Before_Develop/call_interface.html) 说明文档。



## 2. 请求参数

### 查询参数 `Query String parameters`

| 参数名       | 类型   | 必填 | 说明                                                         |
| :----------- | :----- | :--- | :----------------------------------------------------------- |
| access_token | string | 是   | 接口调用凭证，可使用 [access_token](https://developers.weixin.qq.com/doc/service/api/base/api_getaccesstoken)、[authorizer_access_token](https://developers.weixin.qq.com/doc/oplatform/developers/dev/AuthorizerAccessToken.html) |

### 请求体 `Request Payload`

| 参数名   | 类型   | 必填 | 示例     | 说明                   |
| :------- | :----- | :--- | :------- | :--------------------- |
| media_id | string | 是   | MEDIA_ID | 要获取的素材的media_id |



## 3. 返回参数

### 返回体 `Response Payload`

| 参数名      | 类型                                                         | 说明           |
| :---------- | :----------------------------------------------------------- | :------------- |
| news_item   | [objarray](https://developers.weixin.qq.com/doc/service/api/material/permanent/api_getmaterial.html#Res__news_item) | 图文素材，内容 |
| title       | string                                                       | 视频素材，标题 |
| description | string                                                       | 视频素材，描述 |
| down_url    | string                                                       | 视频下载，地址 |



### Res.news_item(Array) `Object Payload`

图文素材，内容

| 参数名             | 类型   | 说明                                                         |
| :----------------- | :----- | :----------------------------------------------------------- |
| title              | string | 图文消息的标题                                               |
| thumb_media_id     | string | 图文消息的封面图片素材id（必须是永久mediaID）                |
| show_cover_pic     | number | 是否显示封面，0为false，即不显示，1为true，即显示            |
| author             | string | 作者                                                         |
| digest             | string | 图文消息的摘要，仅有单图文消息才有摘要，多图文此处为空       |
| content            | string | 图文消息的具体内容，支持HTML标签，必须少于2万字符，小于1M，且此处会去除JS |
| url                | string | 图文页的URL                                                  |
| content_source_url | string | 图文消息的原文地址，即点击“阅读原文”后的URL                  |



## 4. 注意事项

除图文、视频之外，其他类型的素材消息，则响应的直接为素材的内容，开发者可以自行保存为文件。



## 5. 代码示例

### 5.1 图文素材请求示例

请求示例

```json
{
  "media_id": "MEDIA_ID"
}
```

返回示例

```json
{
  "news_item": [
    {
      "title": "TITLE",
      "thumb_media_id": "THUMB_MEDIA_ID",
      "show_cover_pic": 1,
      "author": "AUTHOR",
      "digest": "DIGEST",
      "content": "CONTENT",
      "url": "URL",
      "content_source_url": "CONTENT_SOURCE_URL"
    }
  ]
}
```

### 5.2 视频素材返回示例

请求示例

```json
{
  "media_id": "MEDIA_ID"
}
```

返回示例

```json
{
  "title":TITLE,
  "description":DESCRIPTION,
  "down_url":DOWN_URL,
}
```



## 6. 错误码

以下是本接口的错误码列表，其他错误码可参考 [通用错误码](https://developers.weixin.qq.com/doc/oplatform/developers/errCode/errCode.html)

| 错误码 | 错误描述                                                | 解决方案                                                     |
| :----- | :------------------------------------------------------ | :----------------------------------------------------------- |
| -1     | system error                                            | 系统繁忙，此时请开发者稍候再试                               |
| 40001  | invalid credential access_token isinvalid or not latest | 获取 access_token 时 AppSecret 错误，或者 access_token 无效。请开发者认真比对 AppSecret 的正确性，或查看是否正在为恰当的公众号调用接口 |
| 40007  | invalid media_id                                        | 无效的媒体ID                                                 |



## 