export const assignProperties = (schema: Record<string, unknown>, properties: Record<string, unknown>, required?: string[]) => {
    const newSchema = {
        ...schema,
        properties: {
            ...schema.properties as Record<string, unknown>,
            ...properties
        }
    } as { [ key: string ]: unknown };
    if (required) {
        newSchema['required'] = [ ...(schema['required'] as string[] || []), ...required ];
    }
    return newSchema;
}