# 上传永久素材

[ 调试诊断](https://developers.weixin.qq.com/console/devtools/debug)

> 接口应在服务器端调用，不可在前端（小程序、网页、APP等）直接调用，具体可参考[接口调用指南](https://developers.weixin.qq.com/doc/oplatform/developers/dev/guide.html)

接口英文名：addMaterial

本接口用于新增图片/语音/视频等类型的永久素材。



## 1. 调用方式

### HTTPS 调用

```bash
POST https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=ACCESS_TOKEN&type=video
```

### 云调用

- 调用方法：officialAccount.material.addMaterial
- 出入参和 HTTPS 调用相同，调用方式可查看 [云调用](https://developers.weixin.qq.com/doc/oplatform/developers/dev/cloudCall.html) 说明文档

### 第三方调用

- 本接口支持第三方平台代商家调用。
- 该接口所属的权限集 id 为：11、100
- 服务商获得其中之一权限集授权后，可通过使用 [authorizer_access_token](https://developers.weixin.qq.com/doc/oplatform/developers/dev/AuthorizerAccessToken.html) 代商家进行调用，具体可查看 [第三方调用](https://developers.weixin.qq.com/doc/oplatform/Third-party_Platforms/2.0/api/Before_Develop/call_interface.html) 说明文档。



## 2. 请求参数

### 查询参数 `Query String parameters`

| 参数名       | 类型   | 必填 | 示例         | 说明                                                         |
| :----------- | :----- | :--- | :----------- | :----------------------------------------------------------- |
| access_token | string | 是   | ACCESS_TOKEN | 接口调用凭证，可使用 [access_token](https://developers.weixin.qq.com/doc/service/api/base/api_getaccesstoken)、[authorizer_access_token](https://developers.weixin.qq.com/doc/oplatform/developers/dev/AuthorizerAccessToken.html) |
| type         | string | 是   | video        | 媒体类型，图片（image）、语音（voice）、视频（video）和缩略图（thumb） |

### 请求体 `Request Payload`

| 参数名      | 类型                                                         | 必填 | 说明                             |
| :---------- | :----------------------------------------------------------- | :--- | :------------------------------- |
| media       | formdata                                                     | 是   | 媒体文件标识                     |
| description | [object](https://developers.weixin.qq.com/doc/service/api/material/permanent/api_addmaterial.html#Body__description) | 否   | 素材描述信息，上传视频素材时需要 |



### Body.description `Object Payload`

素材描述信息，上传视频素材时需要

| 参数名       | 类型   | 必填 | 示例     | 说明             |
| :----------- | :----- | :--- | :------- | :--------------- |
| title        | string | 否   | 视频标题 | 视频素材描述标题 |
| introduction | string | 否   | 视频简介 | 视频素材描述简介 |



## 3. 返回参数

### 返回体 `Response Payload`

| 参数名   | 类型   | 说明                    |
| :------- | :----- | :---------------------- |
| media_id | string | 新增的永久素材media_id  |
| url      | string | 图片素材URL(仅图片返回) |



## 4. 注意事项

1. 永久图片素材新增后，将带有URL返回给开发者，开发者可以在腾讯系域名内使用（腾讯系域名外使用，图片将被屏蔽）。
2. 公众号的素材库保存总数量有上限：图文消息素材、图片素材上限为100000，其他类型为1000。
3. 素材的格式大小等要求与公众平台官网一致：

- 图片（image）: 10M，支持bmp/png/jpeg/jpg/gif格式
- 语音（voice）：2M，播放长度不超过60s，mp3/wma/wav/amr格式
- 视频（video）：10MB，支持MP4格式
- 缩略图（thumb）：64KB，支持JPG格式

1. 图文消息的具体内容中，微信后台将过滤外部的图片链接，图片url需通过[上传图文消息图片](https://developers.weixin.qq.com/doc/service/api/material/permanent/api_uploadimage)接口上传图片获取。
2. [上传图文消息图片](https://developers.weixin.qq.com/doc/service/api/material/permanent/api_uploadimage)接口所上传的图片，不占用公众号的素材库中图片数量的100000个的限制，图片仅支持jpg/png格式，大小必须在1MB以下。
3. 图文消息支持正文中插入自己账号和其他公众号/服务号已群发文章链接的能力。



## 5. 代码示例

### 5.1 新增视频示例

请求示例

```bash
curl "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=ACCESS_TOKEN&type=TYPE" -F media=@media.file -F description='{"title":VIDEO_TITLE, "introduction":INTRODUCTION}'
```

返回示例

```json
{
  "media_id": "MEDIA_ID_123456",
  "url": ""
}
```

### 5.2 新增图片示例

请求示例

```json
curl "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=ACCESS_TOKEN&type=TYPE" -F media=@media.file
```

返回示例

```json
{
  "media_id": "MEDIA_ID_654321",
  "url": "https://example.com/image.jpg"
}
```



## 6. 错误码

以下是本接口的错误码列表，其他错误码可参考 [通用错误码](https://developers.weixin.qq.com/doc/oplatform/developers/errCode/errCode.html)

| 错误码 | 错误描述         | 解决方案   |
| :----- | :--------------- | :--------- |
| 40007  | invalid media_id | 无效媒体ID |



## 