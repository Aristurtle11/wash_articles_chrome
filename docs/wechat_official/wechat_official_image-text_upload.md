# 上传图文消息图片

[ 调试诊断](https://developers.weixin.qq.com/console/devtools/debug)

> 接口应在服务器端调用，不可在前端（小程序、网页、APP等）直接调用，具体可参考[接口调用指南](https://developers.weixin.qq.com/doc/oplatform/developers/dev/guide.html)

接口英文名：uploadImage

本接口用于上传图文消息内所需的图片



## 1. 调用方式

### HTTPS 调用

```bash
POST https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=ACCESS_TOKEN
```

### 云调用

- 调用方法：officialAccount.media.uploadImg
- 出入参和 HTTPS 调用相同，调用方式可查看 [云调用](https://developers.weixin.qq.com/doc/oplatform/developers/dev/cloudCall.html) 说明文档

### 第三方调用

- 本接口支持第三方平台代商家调用。
- 该接口所属的权限集 id 为：1、8-9、11、18、37、100
- 服务商获得其中之一权限集授权后，可通过使用 [authorizer_access_token](https://developers.weixin.qq.com/doc/oplatform/developers/dev/AuthorizerAccessToken.html) 代商家进行调用，具体可查看 [第三方调用](https://developers.weixin.qq.com/doc/oplatform/Third-party_Platforms/2.0/api/Before_Develop/call_interface.html) 说明文档。



## 2. 请求参数

### 查询参数 `Query String parameters`

| 参数名       | 类型   | 必填 | 说明                                                         |
| :----------- | :----- | :--- | :----------------------------------------------------------- |
| access_token | string | 是   | 接口调用凭证，可使用 [access_token](https://developers.weixin.qq.com/doc/service/api/base/api_getaccesstoken)、[authorizer_access_token](https://developers.weixin.qq.com/doc/oplatform/developers/dev/AuthorizerAccessToken.html) |

### 请求体 `Request Payload`

| 参数名 | 类型     | 必填 | 说明     |
| :----- | :------- | :--- | :------- |
| media  | formdata | 是   | 图片文件 |



## 3. 返回参数

### 返回体 `Response Payload`

| 参数名  | 类型   | 说明     |
| :------ | :----- | :------- |
| url     | string | 图片URL  |
| errcode | number | 错误码   |
| errmsg  | string | 错误描述 |



## 4. 注意事项

1. 该接口所上传的图片，不占用公众号的素材库中图片数量的100000个的限制，图片仅支持jpg/png格式，大小必须在1MB以下。
2. 图文消息支持正文中插入自己账号和其他公众号已群发文章链接的能力。



## 5. 代码示例

请求示例

```bash
curl -F media=@test.jpg "https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=ACCESS_TOKEN"
```

返回示例

```json
{
  "url": "http://mmbiz.qpic.cn/XXXXX",
  "errcode": 0,
  "errmsg": "ok"
}
```



## 6. 错误码

以下是本接口的错误码列表，其他错误码可参考 [通用错误码](https://developers.weixin.qq.com/doc/oplatform/developers/errCode/errCode.html)

| 错误码 | 错误描述           | 解决方案             |
| :----- | :----------------- | :------------------- |
| 40005  | invalid file type  | 上传素材文件格式不对 |
| 40009  | invalid image size | 图片尺寸太大         |



## 