import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { validator } from "https://cdn.skypack.dev/@exodus/schemasafe?dts";
import {
    schemaIChordServiceConfig,
    schemaIServiceConfig,
    schemaIServiceConfigExposedProperties
} from "../IServiceConfig.ts";

const validateServiceConfig = validator(schemaIServiceConfig, {
    includeErrors: true,
    allErrors: true,
    allowUnusedKeywords: true
});

const validateChordServiceConfig = validator(schemaIChordServiceConfig, {
    includeErrors: true,
    allErrors: true,
    allowUnusedKeywords: true
});

Deno.test("service config schema accepts optional description", () => {
    const serviceConfig = {
        name: "Configured service",
        description: "A tenant-specific description.",
        source: "./services/data.rsm.json",
        basePath: "/data",
        access: { readRoles: "all", writeRoles: "A" }
    };

    assert(validateServiceConfig(serviceConfig));
    assert(validateChordServiceConfig(serviceConfig));
    assertEquals(schemaIServiceConfig.properties.description.type, "string");
    assert(schemaIServiceConfigExposedProperties.includes("description"));
});
