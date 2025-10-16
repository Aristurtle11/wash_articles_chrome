# 获取永久素材列表

[ 调试诊断](https://developers.weixin.qq.com/console/devtools/debug)

> 接口应在服务器端调用，不可在前端（小程序、网页、APP等）直接调用，具体可参考[接口调用指南](https://developers.weixin.qq.com/doc/oplatform/developers/dev/guide.html)

接口英文名：batchGetMaterial

分类型获取永久素材列表，包含公众号在官网素材管理模块新建的素材



## 1. 调用方式

### HTTPS 调用

```bash
POST https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=ACCESS_TOKEN
```

### 云调用

- 调用方法：officialAccount.material.batchGetMaterial
- 出入参和 HTTPS 调用相同，调用方式可查看 [云调用](https://developers.weixin.qq.com/doc/oplatform/developers/dev/cloudCall.html) 说明文档

### 第三方调用

- 本接口支持第三方平台代商家调用。
- 该接口所属的权限集 id 为：11、100
- 服务商获得其中之一权限集授权后，可通过使用 [authorizer_access_token](https://developers.weixin.qq.com/doc/oplatform/developers/dev/AuthorizerAccessToken.html) 代商家进行调用，具体可查看 [第三方调用](https://developers.weixin.qq.com/doc/oplatform/Third-party_Platforms/2.0/api/Before_Develop/call_interface.html) 说明文档。



## 2. 请求参数

### 查询参数 `Query String parameters`

| 参数名       | 类型   | 必填 | 说明                                                         |
| :----------- | :----- | :--- | :----------------------------------------------------------- |
| access_token | string | 是   | 接口调用凭证，可使用 [access_token](https://developers.weixin.qq.com/doc/service/api/base/api_getaccesstoken)、[authorizer_access_token](https://developers.weixin.qq.com/doc/oplatform/developers/dev/AuthorizerAccessToken.html) |

### 请求体 `Request Payload`

| 参数名 | 类型   | 必填 | 示例  | 说明                                                         | 枚举                   |
| :----- | :----- | :--- | :---- | :----------------------------------------------------------- | :--------------------- |
| type   | string | 是   | image | 素材的类型，图片（image）、视频（video）、语音 （voice）、图文（news） | image video voice news |
| offset | number | 是   | 0     | 从全部素材的该偏移位置开始返回，0表示从第一个素材 返回       | -                      |
| count  | number | 是   | 20    | 返回素材的数量，取值在1到20之间                              | -                      |



## 3. 返回参数

### 返回体 `Response Payload`

| 参数名      | 类型                                                         | 说明                     |
| :---------- | :----------------------------------------------------------- | :----------------------- |
| item        | [objarray](https://developers.weixin.qq.com/doc/service/api/material/permanent/api_batchgetmaterial.html#Res__item) | 多个图文消息             |
| total_count | number                                                       | 该类型的素材的总数       |
| item_count  | number                                                       | 本次调用获取的素材的数量 |



### Res.item(Array) `Object Payload`

多个图文消息

| 参数名      | 类型                                                         | 说明                       |
| :---------- | :----------------------------------------------------------- | :------------------------- |
| media_id    | string                                                       | 消息ID                     |
| content     | [object](https://developers.weixin.qq.com/doc/service/api/material/permanent/api_batchgetmaterial.html#Res__item__content) | 图文消息，内容             |
| update_time | number                                                       | 更新日期                   |
| name        | string                                                       | 图片、语音、视频素材的名字 |
| url         | string                                                       | 图片、语音、视频素材URL    |



### Res.item(Array).content `Object Payload`

图文消息，内容

| 参数名    | 类型                                                         | 说明                      |
| :-------- | :----------------------------------------------------------- | :------------------------ |
| news_item | [objarray](https://developers.weixin.qq.com/doc/service/api/material/permanent/api_batchgetmaterial.html#Res__item__content__news_item) | 图文消息内的1篇或多篇文章 |



### Res.item(Array).content.news_item`Object Payload`

图文消息内的1篇或多篇文章

| 参数名             | 类型   | 说明                                                         |
| :----------------- | :----- | :----------------------------------------------------------- |
| title              | string | 图文消息的标题                                               |
| author             | string | 作者                                                         |
| digest             | string | 图文消息的摘要，仅有单图文消息才有摘要，多图文此处为空       |
| content            | string | 图文消息的具体内容，支持HTML标签，必须少于2万字符，小于1M，且此处会去除JS |
| content_source_url | string | 图文消息的原文地址，即点击“阅读原文”后的URL                  |
| thumb_media_id     | string | 图文消息的封面图片素材id（必须是永久mediaID）                |
| show_cover_pic     | number | 是否显示封面，0为false，即不显示，1为true，即显示            |
| url                | string | 图文页的URL，或者，当获取的列表是图片素材列表时，该字段是图片的URL |
| thumb_url          | string | 图文消息的封面图片素材id（必须是永久mediaID）                |



## 4. 注意事项

1、包含公众平台官网新建的图文消息、语音、视频等素材 2、临时素材无法通过本接口获取 3、需https协议调用



## 5. 代码示例

### 5.1 获取图文素材

请求示例

```json
{
  "type": "news",
  "offset": 0,
  "count": 20
}
```

返回示例

```json
{
  "total_count": 100,
  "item_count": 20,
  "item": [
    {
      "media_id": "MEDIA_ID",
      "content": {
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
      },
      "update_time": 1620000000
    }
  ]
}
```

### 5.2 获取图片素材

请求示例

```json
{
  "type": "image",
  "offset": 0,
  "count": 10
}
```

返回示例

```json
{
  "total_count": 50,
  "item_count": 10,
  "item": [
    {
      "media_id": "MEDIA_ID",
      "name": "IMAGE.jpg",
      "update_time": 1620000000,
      "url": "http://mmbiz.qpic.cn/xxx"
    }
  ]
}
```



## 6. 错误码

以下是本接口的错误码列表，其他错误码可参考 [通用错误码](https://developers.weixin.qq.com/doc/oplatform/developers/errCode/errCode.html)

| 错误码 | 错误描述                                                | 解决方案                                                     |
| :----- | :------------------------------------------------------ | :----------------------------------------------------------- |
| -1     | system error                                            | 系统繁忙，此时请开发者稍候再试                               |
| 40001  | invalid credential access_token isinvalid or not latest | 获取 access_token 时 AppSecret 错误，或者 access_token 无效。请开发者认真比对 AppSecret 的正确性，或查看是否正在为恰当的公众号调用接口 |
| 40004  | invalid media type                                      | 不合法的媒体文件类型                                         |
| 40007  | invalid media_id                                        | 无效媒体ID错误                                               |



## 