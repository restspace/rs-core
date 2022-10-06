export const assignProperties = (schema: Record<string, unknown>, schema2: Record<string, unknown>) => {
    const newSchema = {
        ...schema,
        properties: {
            ...schema.properties as Record<string, unknown>,
            ...schema2.properties as Record<string, unknown>
        }
    } as { [ key: string ]: unknown };
    if (schema2.required) {
        newSchema['required'] = [ ...(schema['required'] as string[] || []), ...schema2.required as string[] ];
    }
    if (schema2.definitions) {
        newSchema.definitions = Object.assign(
            (newSchema.definitions as Record<string, unknown>) || {},
            schema2.definitions
        );
    }
    return newSchema;
}