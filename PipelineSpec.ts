import Ajv from "https://cdn.skypack.dev/ajv?dts";

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

export const pipelineValidate = new Ajv().compile(Object.assign({
    definitions: {
        pipeline: pipelineSchema
    }
}, pipelineSchema));