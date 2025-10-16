# Text generation

The Gemini API can generate text output from various inputs, including text, images, video, and audio, leveraging Gemini models.

Here's a basic example that takes a single text input:

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "How does AI work?",
  });
  console.log(response.text);
}

await main();
```



## Thinking with Gemini 2.5

2.5 Flash and Pro models have ["thinking"](https://ai.google.dev/gemini-api/docs/thinking) enabled by default to enhance quality, which may take longer to run and increase token usage.

When using 2.5 Flash, you can disable thinking by setting the thinking budget to zero.

For more details, see the [thinking guide](https://ai.google.dev/gemini-api/docs/thinking#set-budget).

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "How does AI work?",
    config: {
      thinkingConfig: {
        thinkingBudget: 0, // Disables thinking
      },
    }
  });
  console.log(response.text);
}

await main();
```

## System instructions and other configurations

You can guide the behavior of Gemini models with system instructions. To do so, pass a [`GenerateContentConfig`](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig) object.

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Hello there",
    config: {
      systemInstruction: "You are a cat. Your name is Neko.",
    },
  });
  console.log(response.text);
}

await main();
```

The [`GenerateContentConfig`](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig) object also lets you override default generation parameters, such as [temperature](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig).

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Explain how AI works",
    config: {
      temperature: 0.1,
    },
  });
  console.log(response.text);
}

await main();
```

Refer to the [`GenerateContentConfig`](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig) in our API reference for a complete list of configurable parameters and their descriptions.

## Multimodal inputs

The Gemini API supports multimodal inputs, allowing you to combine text with media files. The following example demonstrates providing an image:

```js
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const image = await ai.files.upload({
    file: "/path/to/organ.png",
  });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      createUserContent([
        "Tell me about this instrument",
        createPartFromUri(image.uri, image.mimeType),
      ]),
    ],
  });
  console.log(response.text);
}

await main();
```

For alternative methods of providing images and more advanced image processing, see our [image understanding guide](https://ai.google.dev/gemini-api/docs/image-understanding). The API also supports [document](https://ai.google.dev/gemini-api/docs/document-processing), [video](https://ai.google.dev/gemini-api/docs/video-understanding), and [audio](https://ai.google.dev/gemini-api/docs/audio) inputs and understanding.

## Streaming responses

By default, the model returns a response only after the entire generation process is complete.

For more fluid interactions, use streaming to receive [`GenerateContentResponse`](https://ai.google.dev/api/generate-content#v1beta.GenerateContentResponse) instances incrementally as they're generated.

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: "Explain how AI works",
  });

  for await (const chunk of response) {
    console.log(chunk.text);
  }
}

await main();
```

## Multi-turn conversations (Chat)

Our SDKs provide functionality to collect multiple rounds of prompts and responses into a chat, giving you an easy way to keep track of the conversation history.

**Note:** Chat functionality is only implemented as part of the SDKs. Behind the scenes, it still uses the [`generateContent`](https://ai.google.dev/api/generate-content#method:-models.generatecontent) API. For multi-turn conversations, the full conversation history is sent to the model with each follow-up turn.

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    history: [
      {
        role: "user",
        parts: [{ text: "Hello" }],
      },
      {
        role: "model",
        parts: [{ text: "Great to meet you. What would you like to know?" }],
      },
    ],
  });

  const response1 = await chat.sendMessage({
    message: "I have 2 dogs in my house.",
  });
  console.log("Chat response 1:", response1.text);

  const response2 = await chat.sendMessage({
    message: "How many paws are in my house?",
  });
  console.log("Chat response 2:", response2.text);
}

await main();
```

Streaming can also be used for multi-turn conversations.

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    history: [
      {
        role: "user",
        parts: [{ text: "Hello" }],
      },
      {
        role: "model",
        parts: [{ text: "Great to meet you. What would you like to know?" }],
      },
    ],
  });

  const stream1 = await chat.sendMessageStream({
    message: "I have 2 dogs in my house.",
  });
  for await (const chunk of stream1) {
    console.log(chunk.text);
    console.log("_".repeat(80));
  }

  const stream2 = await chat.sendMessageStream({
    message: "How many paws are in my house?",
  });
  for await (const chunk of stream2) {
    console.log(chunk.text);
    console.log("_".repeat(80));
  }
}

await main();
```

## Supported models

All models in the Gemini family support text generation. To learn more about the models and their capabilities, visit the [Models](https://ai.google.dev/gemini-api/docs/models) page.

## GenerationConfig

Configuration options for model generation and outputs. Not all parameters are configurable for every model.

Fields

`stopSequences[]``string`

Optional. The set of character sequences (up to 5) that will stop output generation. If specified, the API will stop at the first appearance of a `stop_sequence`. The stop sequence will not be included as part of the response.

`responseMimeType``string`

Optional. MIME type of the generated candidate text. Supported MIME types are: `text/plain`: (default) Text output. `application/json`: JSON response in the response candidates. `text/x.enum`: ENUM as a string response in the response candidates. Refer to the [docs](https://ai.google.dev/gemini-api/docs/prompting_with_media#plain_text_formats) for a list of all supported text MIME types.

`responseSchema``object (Schema)`

Optional. Output schema of the generated candidate text. Schemas must be a subset of the [OpenAPI schema](https://spec.openapis.org/oas/v3.0.3#schema) and can be objects, primitives or arrays.

If set, a compatible `responseMimeType` must also be set. Compatible MIME types: `application/json`: Schema for JSON response. Refer to the [JSON text generation guide](https://ai.google.dev/gemini-api/docs/json-mode) for more details.

`_responseJsonSchema``value (Value format)`

Optional. Output schema of the generated response. This is an alternative to `responseSchema` that accepts [JSON Schema](https://json-schema.org/).

If set, `responseSchema` must be omitted, but `responseMimeType` is required.

While the full JSON Schema may be sent, not all features are supported. Specifically, only the following properties are supported:

- `$id`
- `$defs`
- `$ref`
- `$anchor`
- `type`
- `format`
- `title`
- `description`
- `enum` (for strings and numbers)
- `items`
- `prefixItems`
- `minItems`
- `maxItems`
- `minimum`
- `maximum`
- `anyOf`
- `oneOf` (interpreted the same as `anyOf`)
- `properties`
- `additionalProperties`
- `required`

The non-standard `propertyOrdering` property may also be set.

Cyclic references are unrolled to a limited degree and, as such, may only be used within non-required properties. (Nullable properties are not sufficient.) If `$ref` is set on a sub-schema, no other properties, except for than those starting as a `$`, may be set.

`responseJsonSchema``value (Value format)`

Optional. An internal detail. Use `responseJsonSchema` rather than this field.

`responseModalities[]``enum (Modality)`

Optional. The requested modalities of the response. Represents the set of modalities that the model can return, and should be expected in the response. This is an exact match to the modalities of the response.

A model may have multiple combinations of supported modalities. If the requested modalities do not match any of the supported combinations, an error will be returned.

An empty list is equivalent to requesting only text.

`candidateCount``integer`

Optional. Number of generated responses to return. If unset, this will default to 1. Please note that this doesn't work for previous generation models (Gemini 1.0 family)

`maxOutputTokens``integer`

Optional. The maximum number of tokens to include in a response candidate.

Note: The default value varies by model, see the `Model.output_token_limit` attribute of the `Model` returned from the `getModel` function.

`temperature``number`

Optional. Controls the randomness of the output.

Note: The default value varies by model, see the `Model.temperature` attribute of the `Model` returned from the `getModel` function.

Values can range from [0.0, 2.0].

`topP``number`

Optional. The maximum cumulative probability of tokens to consider when sampling.

The model uses combined Top-k and Top-p (nucleus) sampling.

Tokens are sorted based on their assigned probabilities so that only the most likely tokens are considered. Top-k sampling directly limits the maximum number of tokens to consider, while Nucleus sampling limits the number of tokens based on the cumulative probability.

Note: The default value varies by `Model` and is specified by the`Model.top_p` attribute returned from the `getModel` function. An empty `topK` attribute indicates that the model doesn't apply top-k sampling and doesn't allow setting `topK` on requests.

`topK``integer`

Optional. The maximum number of tokens to consider when sampling.

Gemini models use Top-p (nucleus) sampling or a combination of Top-k and nucleus sampling. Top-k sampling considers the set of `topK` most probable tokens. Models running with nucleus sampling don't allow topK setting.

Note: The default value varies by `Model` and is specified by the`Model.top_p` attribute returned from the `getModel` function. An empty `topK` attribute indicates that the model doesn't apply top-k sampling and doesn't allow setting `topK` on requests.

`seed``integer`

Optional. Seed used in decoding. If not set, the request uses a randomly generated seed.

`presencePenalty``number`

Optional. Presence penalty applied to the next token's logprobs if the token has already been seen in the response.

This penalty is binary on/off and not dependant on the number of times the token is used (after the first). Use `frequencyPenalty` for a penalty that increases with each use.

A positive penalty will discourage the use of tokens that have already been used in the response, increasing the vocabulary.

A negative penalty will encourage the use of tokens that have already been used in the response, decreasing the vocabulary.

`frequencyPenalty``number`

Optional. Frequency penalty applied to the next token's logprobs, multiplied by the number of times each token has been seen in the respponse so far.

A positive penalty will discourage the use of tokens that have already been used, proportional to the number of times the token has been used: The more a token is used, the more difficult it is for the model to use that token again increasing the vocabulary of responses.

Caution: A *negative* penalty will encourage the model to reuse tokens proportional to the number of times the token has been used. Small negative values will reduce the vocabulary of a response. Larger negative values will cause the model to start repeating a common token until it hits the `maxOutputTokens` limit.

`responseLogprobs``boolean`

Optional. If true, export the logprobs results in response.

`logprobs``integer`

Optional. Only valid if `responseLogprobs=True`. This sets the number of top logprobs to return at each decoding step in the `Candidate.logprobs_result`. The number must be in the range of [0, 20].

`enableEnhancedCivicAnswers``boolean`

Optional. Enables enhanced civic answers. It may not be available for all models.

`speechConfig``object (SpeechConfig)`

Optional. The speech generation config.

`thinkingConfig``object (ThinkingConfig)`

Optional. Config for thinking features. An error will be returned if this field is set for models that don't support thinking.

`imageConfig``object (ImageConfig)`

Optional. Config for image generation. An error will be returned if this field is set for models that don't support these config options.

`mediaResolution``enum (MediaResolution)`

Optional. If specified, the media resolution specified will be used.