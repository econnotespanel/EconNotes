export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_email?: string
          user_id: string
          user_name?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      announcement_views: {
        Row: {
          announcement_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          author_name: string
          content: string
          created_at: string
          edited_at: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          author_name?: string
          content: string
          created_at?: string
          edited_at?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          author_name?: string
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          bg_color: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bg_color?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bg_color?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
          user_name: string
        }
        Insert: {
          content: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
          user_name?: string
        }
        Update: {
          content?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      kpss_attempts: {
        Row: {
          answers: Json
          created_at: string
          difficulty: string | null
          duration_seconds: number | null
          id: string
          material_id: string | null
          score: number
          subject: string | null
          topic: string | null
          total_questions: number
          user_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          difficulty?: string | null
          duration_seconds?: number | null
          id?: string
          material_id?: string | null
          score?: number
          subject?: string | null
          topic?: string | null
          total_questions?: number
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          difficulty?: string | null
          duration_seconds?: number | null
          id?: string
          material_id?: string | null
          score?: number
          subject?: string | null
          topic?: string | null
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpss_attempts_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "kpss_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      kpss_goals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          label: string | null
          metric: string
          notified: boolean
          target: number
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          label?: string | null
          metric?: string
          notified?: boolean
          target?: number
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          label?: string | null
          metric?: string
          notified?: boolean
          target?: number
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      kpss_materials: {
        Row: {
          content: Json
          created_at: string
          difficulty: string
          id: string
          material_type: string
          model: string | null
          subject: string
          title: string
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          difficulty?: string
          id?: string
          material_type: string
          model?: string | null
          subject: string
          title: string
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          difficulty?: string
          id?: string
          material_type?: string
          model?: string | null
          subject?: string
          title?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kpss_presets: {
        Row: {
          created_at: string
          difficulty: string
          exam_group: string
          focus: string | null
          id: string
          last_used_at: string | null
          material_type: string
          name: string
          question_count: number
          subject: string
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: string
          exam_group: string
          focus?: string | null
          id?: string
          last_used_at?: string | null
          material_type?: string
          name: string
          question_count?: number
          subject: string
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: string
          exam_group?: string
          focus?: string | null
          id?: string
          last_used_at?: string | null
          material_type?: string
          name?: string
          question_count?: number
          subject?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kpss_reviews: {
        Row: {
          created_at: string
          due_at: string
          id: string
          last_result: number | null
          stage: number
          status: string
          subject: string | null
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_at?: string
          id?: string
          last_result?: number | null
          stage?: number
          status?: string
          subject?: string | null
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_at?: string
          id?: string
          last_result?: number | null
          stage?: number
          status?: string
          subject?: string | null
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      message_reports: {
        Row: {
          created_at: string
          id: string
          message_id: string
          reason: string
          reported_user_id: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          reason: string
          reported_user_id: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          reason?: string
          reported_user_id?: string
          reporter_id?: string
          status?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_read: boolean
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      note_downloads: {
        Row: {
          created_at: string
          id: string
          note_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note_id?: string
          user_id?: string
        }
        Relationships: []
      }
      note_views: {
        Row: {
          created_at: string
          id: string
          note_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note_id?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          course: string
          created_at: string
          department: string
          description: string | null
          edited_at: string | null
          file_name: string | null
          file_type: string | null
          file_url: string | null
          grade: number
          has_password: boolean | null
          hidden_by: string | null
          hidden_until: string | null
          id: string
          note_password: string | null
          rejection_reason: string | null
          semester: string
          status: string
          title: string
          university: string | null
          updated_at: string
          uploader_name: string
          user_id: string
          visibility_status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          course: string
          created_at?: string
          department: string
          description?: string | null
          edited_at?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          grade: number
          has_password?: boolean | null
          hidden_by?: string | null
          hidden_until?: string | null
          id?: string
          note_password?: string | null
          rejection_reason?: string | null
          semester: string
          status?: string
          title: string
          university?: string | null
          updated_at?: string
          uploader_name?: string
          user_id: string
          visibility_status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          course?: string
          created_at?: string
          department?: string
          description?: string | null
          edited_at?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          grade?: number
          has_password?: boolean | null
          hidden_by?: string | null
          hidden_until?: string | null
          id?: string
          note_password?: string | null
          rejection_reason?: string | null
          semester?: string
          status?: string
          title?: string
          university?: string | null
          updated_at?: string
          uploader_name?: string
          user_id?: string
          visibility_status?: string
        }
        Relationships: []
      }
      penalties: {
        Row: {
          created_at: string
          id: string
          is_permanent: boolean
          issued_by: string
          penalty_until: string | null
          reason: string
          user_id: string
          warning_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_permanent?: boolean
          issued_by: string
          penalty_until?: string | null
          reason: string
          user_id: string
          warning_number: number
        }
        Update: {
          created_at?: string
          id?: string
          is_permanent?: boolean
          issued_by?: string
          penalty_until?: string | null
          reason?: string
          user_id?: string
          warning_number?: number
        }
        Relationships: []
      }
      point_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          department: string
          full_name: string
          grade: number | null
          hide_surname: boolean
          id: string
          last_login: string | null
          university: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          department?: string
          full_name?: string
          grade?: number | null
          hide_surname?: boolean
          id?: string
          last_login?: string | null
          university?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          department?: string
          full_name?: string
          grade?: number | null
          hide_surname?: boolean
          id?: string
          last_login?: string | null
          university?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_config: {
        Row: {
          brand_name: string
          created_at: string
          id: string
          logo_url: string | null
          pages: Json
          tagline: string | null
          theme: Json
          updated_at: string
        }
        Insert: {
          brand_name?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          pages?: Json
          tagline?: string | null
          theme?: Json
          updated_at?: string
        }
        Update: {
          brand_name?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          pages?: Json
          tagline?: string | null
          theme?: Json
          updated_at?: string
        }
        Relationships: []
      }
      study_materials: {
        Row: {
          content: Json
          course: string | null
          created_at: string
          exam_profile: Json | null
          id: string
          material_type: string
          model: string | null
          source_note_id: string | null
          source_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json
          course?: string | null
          created_at?: string
          exam_profile?: Json | null
          id?: string
          material_type: string
          model?: string | null
          source_note_id?: string | null
          source_type: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          course?: string | null
          created_at?: string
          exam_profile?: Json | null
          id?: string
          material_type?: string
          model?: string | null
          source_note_id?: string | null
          source_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_progress: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          material_id: string
          score: number | null
          total_questions: number | null
          user_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          material_id: string
          score?: number | null
          total_questions?: number | null
          user_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          material_id?: string
          score?: number | null
          total_questions?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_progress_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "study_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      study_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          material_id: string | null
          screenshot_url: string | null
          section: string
          status: string
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          material_id?: string | null
          screenshot_url?: string | null
          section: string
          status?: string
          user_email?: string
          user_id: string
          user_name?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          material_id?: string | null
          screenshot_url?: string | null
          section?: string
          status?: string
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          academic_semester: string | null
          academic_week: number | null
          academic_week_label: string | null
          closed_until: string | null
          closure_image_url: string | null
          closure_message: string | null
          closure_mode: string
          closure_title: string | null
          id: string
          is_system_open: boolean
          note_upload_restricted: boolean
          note_view_restricted: boolean
          updated_at: string
        }
        Insert: {
          academic_semester?: string | null
          academic_week?: number | null
          academic_week_label?: string | null
          closed_until?: string | null
          closure_image_url?: string | null
          closure_message?: string | null
          closure_mode?: string
          closure_title?: string | null
          id?: string
          is_system_open?: boolean
          note_upload_restricted?: boolean
          note_view_restricted?: boolean
          updated_at?: string
        }
        Update: {
          academic_semester?: string | null
          academic_week?: number | null
          academic_week_label?: string | null
          closed_until?: string | null
          closure_image_url?: string | null
          closure_message?: string | null
          closure_mode?: string
          closure_title?: string | null
          id?: string
          is_system_open?: boolean
          note_upload_restricted?: boolean
          note_view_restricted?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      user_points: {
        Row: {
          created_at: string
          current_streak: number
          id: string
          last_login_date: string | null
          longest_streak: number
          points: number
          total_logins: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          id?: string
          last_login_date?: string | null
          longest_streak?: number
          points?: number
          total_logins?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          id?: string
          last_login_date?: string | null
          longest_streak?: number
          points?: number
          total_logins?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_note_password: { Args: { _note_id: string }; Returns: string }
      award_daily_login: {
        Args: never
        Returns: {
          already_claimed: boolean
          awarded: number
          current_streak: number
          longest_streak: number
          points: number
        }[]
      }
      award_points: {
        Args: { _amount: number; _reason: string }
        Returns: number
      }
      get_download_quota: {
        Args: { _user_id: string }
        Returns: {
          allowed_downloads: number
          approved_uploads: number
          can_download: boolean
          is_admin: boolean
          remaining: number
          total_downloads: number
        }[]
      }
      get_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          current_streak: number
          full_name: string
          points: number
          rank: number
          total_logins: number
          university: string
          user_id: string
        }[]
      }
      get_public_system_status: {
        Args: never
        Returns: {
          academic_semester: string
          academic_week: number
          academic_week_label: string
          closed_until: string
          closure_image_url: string
          closure_message: string
          closure_mode: string
          closure_title: string
          is_system_open: boolean
          note_upload_restricted: boolean
          note_view_restricted: boolean
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      mask_display_name: {
        Args: { _full_name: string; _hide: boolean }
        Returns: string
      }
      promote_students_annual: {
        Args: never
        Returns: {
          graduated_total: number
          promoted_total: number
        }[]
      }
      search_member_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          department: string
          full_name: string
          grade: number
          hide_surname: boolean
          university: string
          user_id: string
        }[]
      }
      verify_note_password: {
        Args: { _note_id: string; _password: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "student" | "akademisyen"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "student", "akademisyen"],
    },
  },
} as const
