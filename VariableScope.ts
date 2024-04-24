/**
 * A class to get and set variables according to a scope name
 */
export class VariableScope {
    private scopes: Record<string, Record<string, any>> = {};
    private currentScope: Record<string, any> = {};
    private currentScopeName: string = '';

    constructor(initialScope: Record<string, any> = {}) {
        this.scopes[''] = initialScope;
        this.setScope('');
    }
    /**
     * Set the current scope
     * @param scopeName The name of the scope to set as current
     */
    public setScope(scopeName: string) {
        if (!(scopeName in this.scopes)) {
            this.scopes[scopeName] = {};
        }
        this.currentScope = this.scopes[scopeName];
        this.currentScopeName = scopeName;
    }
    /**
     * Get the current scope name
     * @returns The name of the current scope
     */
    public getScopeName(): string {
        return this.currentScopeName;
    }
    /**
     * Get the current scope
     * @returns The current scope
     */
    public getScope(scopeName: string): VariableScope {
        const scope = new VariableScope();
        scope.scopes = this.scopes;
        scope.setScope(scopeName);
        return scope;
    }

    public getVariables(): Record<string, any> {
        return { ...this.scopes[''], ...this.currentScope };
    }

    public getVariablesForScope(scopeName: string): Record<string, any> {
        return { ...this.scopes[''], ...this.scopes[scopeName] };
    }
    /**
     * Get the value of a variable in the current scope
     * @param variableName The name of the variable to get
     * @returns The value of the variable
     */
    public get(variableName: string): any {
        return this.currentScope[variableName] === undefined
        ? this.scopes['']![variableName]
        : this.currentScope[variableName];
    }
    /**
     * Set the value of a variable in the current scope
     * @param variableName The name of the variable to set
     * @param value The value to set the variable to
     */
    public setForScope(scopeName: string, variableName: string, value: any) {
        if (!(scopeName in this.scopes)) {
            this.scopes[scopeName] = {};
        }
        this.scopes[scopeName][variableName] = value;
    }

    public set(variableName: string, value: any) {
        this.currentScope[variableName] = value;
    }

}