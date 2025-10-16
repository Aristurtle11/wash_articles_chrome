# 删除永久素材

[ 调试诊断](https://developers.weixin.qq.com/console/devtools/debug)

> 接口应在服务器端调用，不可在前端（小程序、网页、APP等）直接调用，具体可参考[接口调用指南](https://developers.weixin.qq.com/doc/oplatform/developers/dev/guide.html)

接口英文名：delMaterial

本接口用于删除不再需要的永久素材，节省存储空间



## 1. 调用方式

### HTTPS 调用

```bash
POST https://api.weixin.qq.com/cgi-bin/material/del_material?access_token=ACCESS_TOKEN
```

### 云调用

- 调用方法：officialAccount.material.delelete
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

| 参数名   | 类型   | 必填 | 示例     | 说明                 |
| :------- | :----- | :--- | :------- | :------------------- |
| media_id | string | 是   | MEDIA_ID | 要删除的素材media_id |



## 3. 返回参数

### 返回体 `Response Payload`

| 参数名  | 类型   | 说明     |
| :------ | :----- | :------- |
| errcode | number | 错误码   |
| errmsg  | string | 错误信息 |



## 4. 注意事项

1. 请谨慎操作本接口，可以删除官网素材管理模块中的图文/语音/视频等素材（需先通过获取素材列表获取media_id）
2. 临时素材无法通过本接口删除",
3. 调用该接口需https协议



## 5. 代码示例

请求示例

```json
{
  "media_id": "MEDIA_ID"
}
```

返回示例

```json
{
  "errcode": 0,
  "errmsg": "ok"
}
```



## 6. 错误码

以下是本接口的错误码列表，其他错误码可参考 [通用错误码](https://developers.weixin.qq.com/doc/oplatform/developers/errCode/errCode.html)

| 错误码 | 错误描述                                                | 解决方案                                                     |
| :----- | :------------------------------------------------------ | :----------------------------------------------------------- |
| -1     | system error                                            | 系统繁忙，此时请开发者稍候再试                               |
| 0      | ok                                                      | 成功                                                         |
| 40001  | invalid credential access_token isinvalid or not latest | 获取 access_token 时 AppSecret 错误，或者 access_token 无效。请开发者认真比对 AppSecret 的正确性，或查看是否正在为恰当的公众号调用接口 |
| 40007  | invalid media_id                                        | 不合法的媒体文件 id                                          |



## 