import { validator } from "https://cdn.skypack.dev/@exodus/schemasafe?dts";
import { Message } from "./Message.ts";

export type PipelineSpec = (string | Record<string, unknown> | PipelineSpec)[];

export const pipelineSchema = {
    type: "array",
    items: {
        type: [ "string", "array" ],
        oneOf: [
            { title: "request", type: "string" },
            { title: "subpipeline", "$ref": "#/definitions/pipeline" }
        ],
        editor: "oneOfRadio"
    }
};

export const pipelineValidate = validator(Object.assign({
    definitions: {
        pipeline: pipelineSchema
    }
}, pipelineSchema), { includeErrors: true, allErrors: true, allowUnusedKeywords: true });

/**
 * Default variables that should always be available to pipeline expressions/transforms.
 * These are injected into the root scope at pipeline start.
 */
export const pipelineDefaultVariables = (msg: Message): Record<string, unknown> => {
    return {
        $_headers: msg.headers,
        $_user: msg.user
    };
};

export const pipelineConcat = (pipeline0?: PipelineSpec, pipeline1?: PipelineSpec) => {
    if (pipeline0 || pipeline1) {
        return (pipeline0 || []).concat(pipeline1 || []);
    } else {
        return undefined;
    }
};