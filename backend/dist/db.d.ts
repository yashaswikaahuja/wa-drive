export declare const pool: import("pg").Pool;
export declare function query(text: string, params?: any[]): Promise<import("pg").QueryResult<any>>;
export declare function auditLog(workspaceId: string, userId: string, eventType: string, entityType: string, entityId: string, metadata?: any): Promise<void>;
//# sourceMappingURL=db.d.ts.map