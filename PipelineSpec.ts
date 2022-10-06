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

export const pipelineValidate = new Ajv({ strictSchema: false, allowUnionTypes: true }).compile(Object.assign({
    definitions: {
        pipeline: pipelineSchema
    }
}, pipelineSchema));

export const pipelineConcat = (pipeline0?: PipelineSpec, pipeline1?: PipelineSpec) => {
    if (pipeline0 || pipeline1) {
        return (pipeline0 || []).concat(pipeline1 || []);
    } else {
        return undefined;
    }
}