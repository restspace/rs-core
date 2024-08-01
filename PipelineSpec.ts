import { validator } from "https://cdn.skypack.dev/@exodus/schemasafe?dts";

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

export const pipelineConcat = (pipeline0?: PipelineSpec, pipeline1?: PipelineSpec) => {
    if (pipeline0 || pipeline1) {
        return (pipeline0 || []).concat(pipeline1 || []);
    } else {
        return undefined;
    }
}