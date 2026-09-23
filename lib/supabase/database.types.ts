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
        Row: { workspace_id: string; user_id: string; role: "owner" | "admin" | "member"; created_at: string };
        Insert: { workspace_id: string; user_id: string; role?: "owner" | "admin" | "member"; created_at?: string };
        Update: { workspace_id?: string; user_id?: string; role?: "owner" | "admin" | "member"; created_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; email: string; display_name: string; created_at: string };
        Insert: { id: string; email: string; display_name: string; created_at?: string };
        Update: { id?: string; email?: string; display_name?: string; created_at?: string };
        Relationships: [];
      };
      workspace_invitations: {
        Row: { id: string; workspace_id: string; email: string; role: "admin" | "member"; status: "pending" | "accepted" | "revoked"; invited_by: string; created_at: string };
        Insert: { id?: string; workspace_id: string; email: string; role?: "admin" | "member"; status?: "pending" | "accepted" | "revoked"; invited_by: string; created_at?: string };
        Update: { id?: string; workspace_id?: string; email?: string; role?: "admin" | "member"; status?: "pending" | "accepted" | "revoked"; invited_by?: string; created_at?: string };
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
        Row: { id: string; board_id: string; column_id: string; title: string; description: string; priority: string; assigned_to: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; board_id: string; column_id: string; title: string; description?: string; priority?: string; assigned_to?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; board_id?: string; column_id?: string; title?: string; description?: string; priority?: string; assigned_to?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      task_activity: {
        Row: { id: string; workspace_id: string; task_id: string | null; actor_id: string; action: "created" | "updated" | "moved" | "assigned" | "deleted"; metadata: Record<string, unknown>; created_at: string };
        Insert: { id?: string; workspace_id: string; task_id?: string | null; actor_id: string; action: "created" | "updated" | "moved" | "assigned" | "deleted"; metadata?: Record<string, unknown>; created_at?: string };
        Update: { id?: string; workspace_id?: string; task_id?: string | null; actor_id?: string; action?: "created" | "updated" | "moved" | "assigned" | "deleted"; metadata?: Record<string, unknown>; created_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      accept_workspace_invitation: {
        Args: { target_invitation_id: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
