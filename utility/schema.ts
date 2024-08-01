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

export const stripUndefined = (value: any): any => {
    if (Array.isArray(value)) {
        return value.map(stripUndefined);
    } else if (typeof value === 'object' && value !== null) {
        const newValue: Record<string, unknown> = {};
        for (const key in value) {
            if (value[key] !== undefined) {
                newValue[key] = stripUndefined(value[key]);
            }
        }
        return newValue;
    } else {
        return value;
    }
}