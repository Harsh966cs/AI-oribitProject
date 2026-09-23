export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: { id: string; name: string; slug: string; created_at: string; created_by: string };
        Insert: { id?: string; name: string; slug: string; created_at?: string; created_by: string };
        Update: { id?: string; name?: string; slug?: string; created_at?: string; created_by?: string };
        Relationships: [];
      };
      workspace_members: {
        Row: { workspace_id: string; user_id: string; role: "owner" | "member"; created_at: string };
        Insert: { workspace_id: string; user_id: string; role?: "owner" | "member"; created_at?: string };
        Update: { workspace_id?: string; user_id?: string; role?: "owner" | "member"; created_at?: string };
        Relationships: [];
      };
      boards: {
        Row: { id: string; workspace_id: string; name: string; created_at: string };
        Insert: { id?: string; workspace_id: string; name: string; created_at?: string };
        Update: { id?: string; workspace_id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      columns: {
        Row: { id: string; board_id: string; name: string; color: string; position: number };
        Insert: { id?: string; board_id: string; name: string; color: string; position: number };
        Update: { id?: string; board_id?: string; name?: string; color?: string; position?: number };
        Relationships: [];
      };
      tasks: {
        Row: { id: string; board_id: string; column_id: string; title: string; description: string; priority: string; created_at: string };
        Insert: { id?: string; board_id: string; column_id: string; title: string; description?: string; priority?: string; created_at?: string };
        Update: { id?: string; board_id?: string; column_id?: string; title?: string; description?: string; priority?: string; created_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
