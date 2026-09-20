export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      access_reviews: {
        Row: {
          accounts_reviewed: number;
          changes_made: number;
          id: string;
          notes: string | null;
          reviewed_at: string;
          reviewed_by: string;
        };
        Insert: {
          accounts_reviewed?: number;
          changes_made?: number;
          id?: string;
          notes?: string | null;
          reviewed_at?: string;
          reviewed_by: string;
        };
        Update: {
          accounts_reviewed?: number;
          changes_made?: number;
          id?: string;
          notes?: string | null;
          reviewed_at?: string;
          reviewed_by?: string;
        };
        Relationships: [];
      };
      agencies: {
        Row: {
          contact_email: string | null;
          contact_name: string;
          contact_phone: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          max_shifts_per_week: number;
          name: string;
          notes: string;
          rate_cna: number;
          rate_nurse: number;
          rate_qma: number;
          updated_at: string;
          weekly_budget: number;
        };
        Insert: {
          contact_email?: string | null;
          contact_name?: string;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          max_shifts_per_week?: number;
          name: string;
          notes?: string;
          rate_cna?: number;
          rate_nurse?: number;
          rate_qma?: number;
          updated_at?: string;
          weekly_budget?: number;
        };
        Update: {
          contact_email?: string | null;
          contact_name?: string;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          max_shifts_per_week?: number;
          name?: string;
          notes?: string;
          rate_cna?: number;
          rate_nurse?: number;
          rate_qma?: number;
          updated_at?: string;
          weekly_budget?: number;
        };
        Relationships: [];
      };
      agency_staff: {
        Row: {
          agency_id: string;
          charting_password: string;
          charting_username: string;
          clock_in_number: string;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_active: boolean;
          notes: string;
          phone: string | null;
          position: Database["public"]["Enums"]["position_type"];
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          agency_id: string;
          charting_password?: string;
          charting_username?: string;
          clock_in_number?: string;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          is_active?: boolean;
          notes?: string;
          phone?: string | null;
          position: Database["public"]["Enums"]["position_type"];
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          agency_id?: string;
          charting_password?: string;
          charting_username?: string;
          clock_in_number?: string;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          notes?: string;
          phone?: string | null;
          position?: Database["public"]["Enums"]["position_type"];
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agency_staff_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      app_config: {
        Row: {
          created_at: string;
          key: string;
          label: string;
          updated_at: string;
          updated_by: string;
          value: Json;
        };
        Insert: {
          created_at?: string;
          key: string;
          label?: string;
          updated_at?: string;
          updated_by?: string;
          value?: Json;
        };
        Update: {
          created_at?: string;
          key?: string;
          label?: string;
          updated_at?: string;
          updated_by?: string;
          value?: Json;
        };
        Relationships: [];
      };
      attendance_events: {
        Row: {
          assignment_id: string | null;
          employee_id: string;
          id: string;
          kind: Database["public"]["Enums"]["attendance_kind"];
          minutes_late: number | null;
          note: string | null;
          occurred_at: string;
          points: number;
        };
        Insert: {
          assignment_id?: string | null;
          employee_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["attendance_kind"];
          minutes_late?: number | null;
          note?: string | null;
          occurred_at?: string;
          points: number;
        };
        Update: {
          assignment_id?: string | null;
          employee_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["attendance_kind"];
          minutes_late?: number | null;
          note?: string | null;
          occurred_at?: string;
          points?: number;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_events_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "shift_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_events_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor: string;
          created_at: string;
          details: Json;
          entity: string | null;
          entity_id: string | null;
          id: string;
          undone_at: string | null;
          undone_by: string | null;
        };
        Insert: {
          action: string;
          actor?: string;
          created_at?: string;
          details?: Json;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
          undone_at?: string | null;
          undone_by?: string | null;
        };
        Update: {
          action?: string;
          actor?: string;
          created_at?: string;
          details?: Json;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
          undone_at?: string | null;
          undone_by?: string | null;
        };
        Relationships: [];
      };
      automation_runs: {
        Row: {
          created_at: string;
          details: Json;
          id: string;
          kind: string;
          status: string;
          summary: string;
        };
        Insert: {
          created_at?: string;
          details?: Json;
          id?: string;
          kind: string;
          status?: string;
          summary?: string;
        };
        Update: {
          created_at?: string;
          details?: Json;
          id?: string;
          kind?: string;
          status?: string;
          summary?: string;
        };
        Relationships: [];
      };
      automation_settings: {
        Row: {
          access_review_days: number;
          audit_retention_days: number;
          auto_fill_days: number;
          autopilot_enabled: boolean;
          buyback_enabled: boolean;
          buyback_max_points_per_year: number;
          buyback_points_removed: number;
          buyback_shifts_required: number;
          coverage_buffer: number;
          created_at: string;
          data_retention_days: number;
          horizon_weeks: number;
          id: string;
          last_run_at: string | null;
          message_retention_days: number;
          notify_delivery_failures: boolean;
          notify_onboarding: boolean;
          notify_schedule_updates: boolean;
          paused_reason: string | null;
          ppd_goal: number;
          quiet_hours_end: number;
          quiet_hours_start: number;
          recency_weight: number;
          seniority_weight: number;
          session_timeout_minutes: number;
          singleton: boolean;
          sms_enabled: boolean;
          undo_window_minutes: number;
          updated_at: string;
          updated_by: string | null;
          watch_only: boolean;
        };
        Insert: {
          access_review_days?: number;
          audit_retention_days?: number;
          auto_fill_days?: number;
          autopilot_enabled?: boolean;
          buyback_enabled?: boolean;
          buyback_max_points_per_year?: number;
          buyback_points_removed?: number;
          buyback_shifts_required?: number;
          coverage_buffer?: number;
          created_at?: string;
          data_retention_days?: number;
          horizon_weeks?: number;
          id?: string;
          last_run_at?: string | null;
          message_retention_days?: number;
          notify_delivery_failures?: boolean;
          notify_onboarding?: boolean;
          notify_schedule_updates?: boolean;
          paused_reason?: string | null;
          ppd_goal?: number;
          quiet_hours_end?: number;
          quiet_hours_start?: number;
          recency_weight?: number;
          seniority_weight?: number;
          session_timeout_minutes?: number;
          singleton?: boolean;
          sms_enabled?: boolean;
          undo_window_minutes?: number;
          updated_at?: string;
          updated_by?: string | null;
          watch_only?: boolean;
        };
        Update: {
          access_review_days?: number;
          audit_retention_days?: number;
          auto_fill_days?: number;
          autopilot_enabled?: boolean;
          buyback_enabled?: boolean;
          buyback_max_points_per_year?: number;
          buyback_points_removed?: number;
          buyback_shifts_required?: number;
          coverage_buffer?: number;
          created_at?: string;
          data_retention_days?: number;
          horizon_weeks?: number;
          id?: string;
          last_run_at?: string | null;
          message_retention_days?: number;
          notify_delivery_failures?: boolean;
          notify_onboarding?: boolean;
          notify_schedule_updates?: boolean;
          paused_reason?: string | null;
          ppd_goal?: number;
          quiet_hours_end?: number;
          quiet_hours_start?: number;
          recency_weight?: number;
          seniority_weight?: number;
          session_timeout_minutes?: number;
          singleton?: boolean;
          sms_enabled?: boolean;
          undo_window_minutes?: number;
          updated_at?: string;
          updated_by?: string | null;
          watch_only?: boolean;
        };
        Relationships: [];
      };
      call_off_intakes: {
        Row: {
          caller_name: string;
          caller_phone: string;
          channel: string;
          confidence: number;
          created_at: string;
          employee_id: string | null;
          id: string;
          minutes_late: number | null;
          outcome: string;
          parsed_date: string | null;
          parsed_kind: string | null;
          parsed_shift: Database["public"]["Enums"]["shift_type"] | null;
          status: string;
          transcript: string;
          updated_at: string;
        };
        Insert: {
          caller_name?: string;
          caller_phone?: string;
          channel?: string;
          confidence?: number;
          created_at?: string;
          employee_id?: string | null;
          id?: string;
          minutes_late?: number | null;
          outcome?: string;
          parsed_date?: string | null;
          parsed_kind?: string | null;
          parsed_shift?: Database["public"]["Enums"]["shift_type"] | null;
          status?: string;
          transcript?: string;
          updated_at?: string;
        };
        Update: {
          caller_name?: string;
          caller_phone?: string;
          channel?: string;
          confidence?: number;
          created_at?: string;
          employee_id?: string | null;
          id?: string;
          minutes_late?: number | null;
          outcome?: string;
          parsed_date?: string | null;
          parsed_kind?: string | null;
          parsed_shift?: Database["public"]["Enums"]["shift_type"] | null;
          status?: string;
          transcript?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_off_intakes_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      census_days: {
        Row: {
          census: number;
          created_at: string;
          date: string;
          id: string;
          imported_at: string | null;
          source: string;
          unit_id: string;
        };
        Insert: {
          census?: number;
          created_at?: string;
          date: string;
          id?: string;
          imported_at?: string | null;
          source?: string;
          unit_id: string;
        };
        Update: {
          census?: number;
          created_at?: string;
          date?: string;
          id?: string;
          imported_at?: string | null;
          source?: string;
          unit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "census_days_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      census_imports: {
        Row: {
          connector: string;
          created_at: string;
          created_by: string;
          details: Json;
          file_name: string;
          id: string;
          message: string;
          period_end: string | null;
          period_start: string | null;
          rows_applied: number;
          rows_received: number;
          rows_skipped: number;
          source: string;
          status: string;
        };
        Insert: {
          connector?: string;
          created_at?: string;
          created_by?: string;
          details?: Json;
          file_name?: string;
          id?: string;
          message?: string;
          period_end?: string | null;
          period_start?: string | null;
          rows_applied?: number;
          rows_received?: number;
          rows_skipped?: number;
          source?: string;
          status?: string;
        };
        Update: {
          connector?: string;
          created_at?: string;
          created_by?: string;
          details?: Json;
          file_name?: string;
          id?: string;
          message?: string;
          period_end?: string | null;
          period_start?: string | null;
          rows_applied?: number;
          rows_received?: number;
          rows_skipped?: number;
          source?: string;
          status?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          role: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      compliance_items: {
        Row: {
          category: string;
          created_at: string;
          detail: string;
          evidence_url: string;
          id: string;
          next_review_on: string | null;
          owner: string;
          reviewed_on: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          detail?: string;
          evidence_url?: string;
          id?: string;
          next_review_on?: string | null;
          owner?: string;
          reviewed_on?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          detail?: string;
          evidence_url?: string;
          id?: string;
          next_review_on?: string | null;
          owner?: string;
          reviewed_on?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      course_completions: {
        Row: {
          completed_on: string;
          course_id: string;
          created_at: string;
          due_on: string | null;
          employee_id: string | null;
          id: string;
          minutes: number;
          new_hire_id: string | null;
          notes: string;
          recorded_by: string;
          score: number | null;
          updated_at: string;
        };
        Insert: {
          completed_on?: string;
          course_id: string;
          created_at?: string;
          due_on?: string | null;
          employee_id?: string | null;
          id?: string;
          minutes?: number;
          new_hire_id?: string | null;
          notes?: string;
          recorded_by?: string;
          score?: number | null;
          updated_at?: string;
        };
        Update: {
          completed_on?: string;
          course_id?: string;
          created_at?: string;
          due_on?: string | null;
          employee_id?: string | null;
          id?: string;
          minutes?: number;
          new_hire_id?: string | null;
          notes?: string;
          recorded_by?: string;
          score?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_completions_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "inservice_courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_completions_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_completions_new_hire_id_fkey";
            columns: ["new_hire_id"];
            isOneToOne: false;
            referencedRelation: "new_hires";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_credentials: {
        Row: {
          created_at: string;
          employee_id: string;
          expires_on: string;
          id: string;
          identifier: string;
          issued_on: string | null;
          kind: string;
          last_warned_on: string | null;
          notes: string;
          removed_from_schedule: boolean;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          employee_id: string;
          expires_on: string;
          id?: string;
          identifier?: string;
          issued_on?: string | null;
          kind: string;
          last_warned_on?: string | null;
          notes?: string;
          removed_from_schedule?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          expires_on?: string;
          id?: string;
          identifier?: string;
          issued_on?: string | null;
          kind?: string;
          last_warned_on?: string | null;
          notes?: string;
          removed_from_schedule?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_credentials_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_notes: {
        Row: {
          author_id: string | null;
          author_name: string;
          body: string;
          category: string;
          created_at: string;
          employee_id: string;
          id: string;
          pinned: boolean;
          updated_at: string;
        };
        Insert: {
          author_id?: string | null;
          author_name?: string;
          body: string;
          category?: string;
          created_at?: string;
          employee_id: string;
          id?: string;
          pinned?: boolean;
          updated_at?: string;
        };
        Update: {
          author_id?: string | null;
          author_name?: string;
          body?: string;
          category?: string;
          created_at?: string;
          employee_id?: string;
          id?: string;
          pinned?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_notes_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_notes_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          clock_in_number: string;
          created_at: string;
          days_per_week: number;
          email: string | null;
          employment_type: string;
          float_count: number;
          float_pool_optin: boolean;
          full_name: string;
          hire_date: string;
          home_facility_id: string | null;
          hourly_rate: number;
          id: string;
          in_training: boolean;
          is_active: boolean;
          last_floated_on: string | null;
          max_hours_per_week: number;
          no_show_risk: number;
          notes: string | null;
          payroll_id: string;
          phone: string | null;
          position: Database["public"]["Enums"]["position_type"];
          primary_unit_id: string | null;
          punch_pin: string;
          qualified_unit_ids: string[];
          reward_points: number;
          risk_label: string;
          risk_reason: string;
          risk_updated_at: string | null;
          rotation_week_a_days: number[];
          rotation_week_b_days: number[];
          scheduled_days: number[];
          scheduled_shift: Database["public"]["Enums"]["shift_type"];
          sms_optin: boolean;
          termination_date: string | null;
          training_ends_on: string | null;
          user_id: string | null;
          weekend_group: string | null;
        };
        Insert: {
          clock_in_number?: string;
          created_at?: string;
          days_per_week?: number;
          email?: string | null;
          employment_type?: string;
          float_count?: number;
          float_pool_optin?: boolean;
          full_name: string;
          hire_date?: string;
          home_facility_id?: string | null;
          hourly_rate?: number;
          id?: string;
          in_training?: boolean;
          is_active?: boolean;
          last_floated_on?: string | null;
          max_hours_per_week?: number;
          no_show_risk?: number;
          notes?: string | null;
          payroll_id?: string;
          phone?: string | null;
          position: Database["public"]["Enums"]["position_type"];
          primary_unit_id?: string | null;
          punch_pin?: string;
          qualified_unit_ids?: string[];
          reward_points?: number;
          risk_label?: string;
          risk_reason?: string;
          risk_updated_at?: string | null;
          rotation_week_a_days?: number[];
          rotation_week_b_days?: number[];
          scheduled_days?: number[];
          scheduled_shift: Database["public"]["Enums"]["shift_type"];
          sms_optin?: boolean;
          termination_date?: string | null;
          training_ends_on?: string | null;
          user_id?: string | null;
          weekend_group?: string | null;
        };
        Update: {
          clock_in_number?: string;
          created_at?: string;
          days_per_week?: number;
          email?: string | null;
          employment_type?: string;
          float_count?: number;
          float_pool_optin?: boolean;
          full_name?: string;
          hire_date?: string;
          home_facility_id?: string | null;
          hourly_rate?: number;
          id?: string;
          in_training?: boolean;
          is_active?: boolean;
          last_floated_on?: string | null;
          max_hours_per_week?: number;
          no_show_risk?: number;
          notes?: string | null;
          payroll_id?: string;
          phone?: string | null;
          position?: Database["public"]["Enums"]["position_type"];
          primary_unit_id?: string | null;
          punch_pin?: string;
          qualified_unit_ids?: string[];
          reward_points?: number;
          risk_label?: string;
          risk_reason?: string;
          risk_updated_at?: string | null;
          rotation_week_a_days?: number[];
          rotation_week_b_days?: number[];
          scheduled_days?: number[];
          scheduled_shift?: Database["public"]["Enums"]["shift_type"];
          sms_optin?: boolean;
          termination_date?: string | null;
          training_ends_on?: string | null;
          user_id?: string | null;
          weekend_group?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employees_home_facility_id_fkey";
            columns: ["home_facility_id"];
            isOneToOne: false;
            referencedRelation: "facilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_primary_unit_id_fkey";
            columns: ["primary_unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      facilities: {
        Row: {
          address: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          updated_at: string;
          weekly_labor_budget: number;
        };
        Insert: {
          address?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          updated_at?: string;
          weekly_labor_budget?: number;
        };
        Update: {
          address?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          weekly_labor_budget?: number;
        };
        Relationships: [];
      };
      float_events: {
        Row: {
          assignment_id: string | null;
          automatic: boolean;
          created_at: string;
          decided_by: string;
          employee_id: string;
          float_count_before: number;
          from_unit_id: string | null;
          id: string;
          position: Database["public"]["Enums"]["position_type"] | null;
          rationale: string;
          reason: string;
          returned_home: boolean;
          seniority_rank: number | null;
          shift: Database["public"]["Enums"]["shift_type"] | null;
          shift_date: string;
          to_unit_id: string | null;
        };
        Insert: {
          assignment_id?: string | null;
          automatic?: boolean;
          created_at?: string;
          decided_by?: string;
          employee_id: string;
          float_count_before?: number;
          from_unit_id?: string | null;
          id?: string;
          position?: Database["public"]["Enums"]["position_type"] | null;
          rationale?: string;
          reason?: string;
          returned_home?: boolean;
          seniority_rank?: number | null;
          shift?: Database["public"]["Enums"]["shift_type"] | null;
          shift_date: string;
          to_unit_id?: string | null;
        };
        Update: {
          assignment_id?: string | null;
          automatic?: boolean;
          created_at?: string;
          decided_by?: string;
          employee_id?: string;
          float_count_before?: number;
          from_unit_id?: string | null;
          id?: string;
          position?: Database["public"]["Enums"]["position_type"] | null;
          rationale?: string;
          reason?: string;
          returned_home?: boolean;
          seniority_rank?: number | null;
          shift?: Database["public"]["Enums"]["shift_type"] | null;
          shift_date?: string;
          to_unit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "float_events_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "shift_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "float_events_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "float_events_from_unit_id_fkey";
            columns: ["from_unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "float_events_to_unit_id_fkey";
            columns: ["to_unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      hire_documents: {
        Row: {
          created_at: string;
          doc_type: string;
          employee_id: string | null;
          file_url: string;
          id: string;
          new_hire_id: string | null;
          notes: string;
          sent_at: string | null;
          signature_ip: string;
          signed_at: string | null;
          signed_name: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          doc_type: string;
          employee_id?: string | null;
          file_url?: string;
          id?: string;
          new_hire_id?: string | null;
          notes?: string;
          sent_at?: string | null;
          signature_ip?: string;
          signed_at?: string | null;
          signed_name?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          doc_type?: string;
          employee_id?: string | null;
          file_url?: string;
          id?: string;
          new_hire_id?: string | null;
          notes?: string;
          sent_at?: string | null;
          signature_ip?: string;
          signed_at?: string | null;
          signed_name?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hire_documents_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hire_documents_new_hire_id_fkey";
            columns: ["new_hire_id"];
            isOneToOne: false;
            referencedRelation: "new_hires";
            referencedColumns: ["id"];
          },
        ];
      };
      import_batches: {
        Row: {
          created_at: string;
          created_by: string;
          errors: Json;
          file_name: string;
          id: string;
          kind: string;
          message: string;
          rows_applied: number;
          rows_received: number;
          rows_skipped: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          errors?: Json;
          file_name?: string;
          id?: string;
          kind: string;
          message?: string;
          rows_applied?: number;
          rows_received?: number;
          rows_skipped?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          errors?: Json;
          file_name?: string;
          id?: string;
          kind?: string;
          message?: string;
          rows_applied?: number;
          rows_received?: number;
          rows_skipped?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inservice_courses: {
        Row: {
          applies_to_positions: Database["public"]["Enums"]["position_type"][];
          category: string;
          content_url: string;
          created_at: string;
          description: string;
          id: string;
          is_active: boolean;
          recurrence_months: number;
          required_for_new_hires: boolean;
          required_minutes: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          applies_to_positions?: Database["public"]["Enums"]["position_type"][];
          category?: string;
          content_url?: string;
          created_at?: string;
          description?: string;
          id?: string;
          is_active?: boolean;
          recurrence_months?: number;
          required_for_new_hires?: boolean;
          required_minutes?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          applies_to_positions?: Database["public"]["Enums"]["position_type"][];
          category?: string;
          content_url?: string;
          created_at?: string;
          description?: string;
          id?: string;
          is_active?: boolean;
          recurrence_months?: number;
          required_for_new_hires?: boolean;
          required_minutes?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      integration_connections: {
        Row: {
          auth_mode: string;
          config: Json;
          consecutive_failures: number;
          created_at: string;
          direction: string;
          endpoint_path: string;
          expected_every_minutes: number;
          failure_threshold: number;
          fallback_mode: string;
          id: string;
          is_enabled: boolean;
          is_required: boolean;
          kind: string;
          last_failure_at: string | null;
          last_message: string;
          last_success_at: string | null;
          last_sync_at: string | null;
          name: string;
          notes: string;
          slug: string;
          stale_after_minutes: number;
          status: string;
          total_syncs: number;
          transport: string;
          updated_at: string;
          vendor: string;
        };
        Insert: {
          auth_mode?: string;
          config?: Json;
          consecutive_failures?: number;
          created_at?: string;
          direction?: string;
          endpoint_path?: string;
          expected_every_minutes?: number;
          failure_threshold?: number;
          fallback_mode?: string;
          id?: string;
          is_enabled?: boolean;
          is_required?: boolean;
          kind: string;
          last_failure_at?: string | null;
          last_message?: string;
          last_success_at?: string | null;
          last_sync_at?: string | null;
          name: string;
          notes?: string;
          slug: string;
          stale_after_minutes?: number;
          status?: string;
          total_syncs?: number;
          transport?: string;
          updated_at?: string;
          vendor?: string;
        };
        Update: {
          auth_mode?: string;
          config?: Json;
          consecutive_failures?: number;
          created_at?: string;
          direction?: string;
          endpoint_path?: string;
          expected_every_minutes?: number;
          failure_threshold?: number;
          fallback_mode?: string;
          id?: string;
          is_enabled?: boolean;
          is_required?: boolean;
          kind?: string;
          last_failure_at?: string | null;
          last_message?: string;
          last_success_at?: string | null;
          last_sync_at?: string | null;
          name?: string;
          notes?: string;
          slug?: string;
          stale_after_minutes?: number;
          status?: string;
          total_syncs?: number;
          transport?: string;
          updated_at?: string;
          vendor?: string;
        };
        Relationships: [];
      };
      integration_incidents: {
        Row: {
          acknowledged_by: string;
          connection_id: string;
          created_at: string;
          details: Json;
          fallback_used: string;
          id: string;
          impact: string;
          opened_at: string;
          resolved_at: string | null;
          severity: string;
          status: string;
          summary: string;
          updated_at: string;
        };
        Insert: {
          acknowledged_by?: string;
          connection_id: string;
          created_at?: string;
          details?: Json;
          fallback_used?: string;
          id?: string;
          impact?: string;
          opened_at?: string;
          resolved_at?: string | null;
          severity?: string;
          status?: string;
          summary?: string;
          updated_at?: string;
        };
        Update: {
          acknowledged_by?: string;
          connection_id?: string;
          created_at?: string;
          details?: Json;
          fallback_used?: string;
          id?: string;
          impact?: string;
          opened_at?: string;
          resolved_at?: string | null;
          severity?: string;
          status?: string;
          summary?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_incidents_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "integration_connections";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_snapshots: {
        Row: {
          captured_at: string;
          connection_id: string;
          created_at: string;
          id: string;
          kind: string;
          payload: Json;
          rows: number;
          summary: string;
        };
        Insert: {
          captured_at?: string;
          connection_id: string;
          created_at?: string;
          id?: string;
          kind: string;
          payload?: Json;
          rows?: number;
          summary?: string;
        };
        Update: {
          captured_at?: string;
          connection_id?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          payload?: Json;
          rows?: number;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_snapshots_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "integration_connections";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_syncs: {
        Row: {
          connection_id: string;
          created_at: string;
          created_by: string;
          details: Json;
          direction: string;
          duration_ms: number;
          id: string;
          message: string;
          rows_applied: number;
          rows_received: number;
          rows_skipped: number;
          status: string;
          trigger: string;
        };
        Insert: {
          connection_id: string;
          created_at?: string;
          created_by?: string;
          details?: Json;
          direction?: string;
          duration_ms?: number;
          id?: string;
          message?: string;
          rows_applied?: number;
          rows_received?: number;
          rows_skipped?: number;
          status?: string;
          trigger?: string;
        };
        Update: {
          connection_id?: string;
          created_at?: string;
          created_by?: string;
          details?: Json;
          direction?: string;
          duration_ms?: number;
          id?: string;
          message?: string;
          rows_applied?: number;
          rows_received?: number;
          rows_skipped?: number;
          status?: string;
          trigger?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_syncs_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "integration_connections";
            referencedColumns: ["id"];
          },
        ];
      };
      job_applicants: {
        Row: {
          ai_score: number | null;
          ai_summary: string | null;
          applied_at: string;
          email: string | null;
          full_name: string;
          id: string;
          notes: string;
          phone: string | null;
          posting_id: string | null;
          source: string;
          stage: string;
          updated_at: string;
        };
        Insert: {
          ai_score?: number | null;
          ai_summary?: string | null;
          applied_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          notes?: string;
          phone?: string | null;
          posting_id?: string | null;
          source?: string;
          stage?: string;
          updated_at?: string;
        };
        Update: {
          ai_score?: number | null;
          ai_summary?: string | null;
          applied_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          notes?: string;
          phone?: string | null;
          posting_id?: string | null;
          source?: string;
          stage?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_applicants_posting_id_fkey";
            columns: ["posting_id"];
            isOneToOne: false;
            referencedRelation: "job_postings";
            referencedColumns: ["id"];
          },
        ];
      };
      job_postings: {
        Row: {
          created_at: string;
          description: string;
          employment_type: string;
          id: string;
          openings: number;
          pay_range: string;
          position: Database["public"]["Enums"]["position_type"];
          shift: Database["public"]["Enums"]["shift_type"] | null;
          status: string;
          title: string;
          unit_id: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string;
          employment_type?: string;
          id?: string;
          openings?: number;
          pay_range?: string;
          position: Database["public"]["Enums"]["position_type"];
          shift?: Database["public"]["Enums"]["shift_type"] | null;
          status?: string;
          title: string;
          unit_id?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string;
          employment_type?: string;
          id?: string;
          openings?: number;
          pay_range?: string;
          position?: Database["public"]["Enums"]["position_type"];
          shift?: Database["public"]["Enums"]["shift_type"] | null;
          status?: string;
          title?: string;
          unit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_postings_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      login_attempts: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          ip: string;
          reason: string | null;
          succeeded: boolean;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          ip?: string;
          reason?: string | null;
          succeeded?: boolean;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          ip?: string;
          reason?: string | null;
          succeeded?: boolean;
        };
        Relationships: [];
      };
      marketplace_offers: {
        Row: {
          assignment_id: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          offered_rate: number;
          position: Database["public"]["Enums"]["position_type"];
          reason: string;
          responded_at: string | null;
          shift: Database["public"]["Enums"]["shift_type"];
          shift_date: string;
          status: string;
          unit_id: string | null;
          updated_at: string;
          worker_id: string | null;
        };
        Insert: {
          assignment_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          offered_rate?: number;
          position: Database["public"]["Enums"]["position_type"];
          reason?: string;
          responded_at?: string | null;
          shift: Database["public"]["Enums"]["shift_type"];
          shift_date: string;
          status?: string;
          unit_id?: string | null;
          updated_at?: string;
          worker_id?: string | null;
        };
        Update: {
          assignment_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          offered_rate?: number;
          position?: Database["public"]["Enums"]["position_type"];
          reason?: string;
          responded_at?: string | null;
          shift?: Database["public"]["Enums"]["shift_type"];
          shift_date?: string;
          status?: string;
          unit_id?: string | null;
          updated_at?: string;
          worker_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "marketplace_offers_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "shift_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketplace_offers_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketplace_offers_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "marketplace_workers";
            referencedColumns: ["id"];
          },
        ];
      };
      marketplace_workers: {
        Row: {
          city: string;
          created_at: string;
          email: string;
          full_name: string;
          hourly_rate: number;
          id: string;
          is_active: boolean;
          license_expires_on: string | null;
          license_number: string;
          no_shows: number;
          notes: string;
          phone: string;
          position: Database["public"]["Enums"]["position_type"];
          reliability: number;
          shifts_worked: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          city?: string;
          created_at?: string;
          email?: string;
          full_name: string;
          hourly_rate?: number;
          id?: string;
          is_active?: boolean;
          license_expires_on?: string | null;
          license_number?: string;
          no_shows?: number;
          notes?: string;
          phone?: string;
          position: Database["public"]["Enums"]["position_type"];
          reliability?: number;
          shifts_worked?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          city?: string;
          created_at?: string;
          email?: string;
          full_name?: string;
          hourly_rate?: number;
          id?: string;
          is_active?: boolean;
          license_expires_on?: string | null;
          license_number?: string;
          no_shows?: number;
          notes?: string;
          phone?: string;
          position?: Database["public"]["Enums"]["position_type"];
          reliability?: number;
          shifts_worked?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      message_outbox: {
        Row: {
          attempts: number;
          body: string;
          channel: string;
          created_at: string;
          employee_id: string | null;
          error: string;
          id: string;
          kind: string;
          provider_id: string;
          scheduled_for: string;
          sent_at: string | null;
          status: string;
          to_address: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          body: string;
          channel?: string;
          created_at?: string;
          employee_id?: string | null;
          error?: string;
          id?: string;
          kind?: string;
          provider_id?: string;
          scheduled_for?: string;
          sent_at?: string | null;
          status?: string;
          to_address: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          body?: string;
          channel?: string;
          created_at?: string;
          employee_id?: string | null;
          error?: string;
          id?: string;
          kind?: string;
          provider_id?: string;
          scheduled_for?: string;
          sent_at?: string | null;
          status?: string;
          to_address?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_outbox_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          audience: string;
          body: string;
          created_at: string;
          id: string;
          read_at: string | null;
          recipient_id: string | null;
          sender_id: string | null;
          sender_name: string;
          subject: string;
        };
        Insert: {
          audience?: string;
          body: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          recipient_id?: string | null;
          sender_id?: string | null;
          sender_name?: string;
          subject?: string;
        };
        Update: {
          audience?: string;
          body?: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          recipient_id?: string | null;
          sender_id?: string | null;
          sender_name?: string;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      new_hires: {
        Row: {
          added_to_schedule: boolean;
          applicant_id: string | null;
          background_check_done: boolean;
          badge_issued: boolean;
          charting_login_created: boolean;
          charting_username: string;
          clock_in_number: string;
          created_at: string;
          days_per_week: number;
          drug_screen_done: boolean;
          email: string;
          emergency_contact_name: string;
          emergency_contact_phone: string;
          employee_id: string | null;
          employment_type: string;
          facility_id: string | null;
          full_name: string;
          hourly_rate: number;
          id: string;
          license_expires_on: string | null;
          license_number: string;
          license_verified: boolean;
          notes: string;
          offer_accepted: boolean;
          offer_date: string | null;
          orientation_end: string | null;
          orientation_scheduled: boolean;
          orientation_start: string | null;
          paperwork_done: boolean;
          payroll_id: string;
          phone: string;
          physical_tb_done: boolean;
          position: Database["public"]["Enums"]["position_type"];
          preceptor_id: string | null;
          recruiter: string;
          shift: Database["public"]["Enums"]["shift_type"] | null;
          source: string;
          start_date: string | null;
          status: string;
          unit_id: string | null;
          updated_at: string;
        };
        Insert: {
          added_to_schedule?: boolean;
          applicant_id?: string | null;
          background_check_done?: boolean;
          badge_issued?: boolean;
          charting_login_created?: boolean;
          charting_username?: string;
          clock_in_number?: string;
          created_at?: string;
          days_per_week?: number;
          drug_screen_done?: boolean;
          email?: string;
          emergency_contact_name?: string;
          emergency_contact_phone?: string;
          employee_id?: string | null;
          employment_type?: string;
          facility_id?: string | null;
          full_name: string;
          hourly_rate?: number;
          id?: string;
          license_expires_on?: string | null;
          license_number?: string;
          license_verified?: boolean;
          notes?: string;
          offer_accepted?: boolean;
          offer_date?: string | null;
          orientation_end?: string | null;
          orientation_scheduled?: boolean;
          orientation_start?: string | null;
          paperwork_done?: boolean;
          payroll_id?: string;
          phone?: string;
          physical_tb_done?: boolean;
          position?: Database["public"]["Enums"]["position_type"];
          preceptor_id?: string | null;
          recruiter?: string;
          shift?: Database["public"]["Enums"]["shift_type"] | null;
          source?: string;
          start_date?: string | null;
          status?: string;
          unit_id?: string | null;
          updated_at?: string;
        };
        Update: {
          added_to_schedule?: boolean;
          applicant_id?: string | null;
          background_check_done?: boolean;
          badge_issued?: boolean;
          charting_login_created?: boolean;
          charting_username?: string;
          clock_in_number?: string;
          created_at?: string;
          days_per_week?: number;
          drug_screen_done?: boolean;
          email?: string;
          emergency_contact_name?: string;
          emergency_contact_phone?: string;
          employee_id?: string | null;
          employment_type?: string;
          facility_id?: string | null;
          full_name?: string;
          hourly_rate?: number;
          id?: string;
          license_expires_on?: string | null;
          license_number?: string;
          license_verified?: boolean;
          notes?: string;
          offer_accepted?: boolean;
          offer_date?: string | null;
          orientation_end?: string | null;
          orientation_scheduled?: boolean;
          orientation_start?: string | null;
          paperwork_done?: boolean;
          payroll_id?: string;
          phone?: string;
          physical_tb_done?: boolean;
          position?: Database["public"]["Enums"]["position_type"];
          preceptor_id?: string | null;
          recruiter?: string;
          shift?: Database["public"]["Enums"]["shift_type"] | null;
          source?: string;
          start_date?: string | null;
          status?: string;
          unit_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "new_hires_applicant_id_fkey";
            columns: ["applicant_id"];
            isOneToOne: false;
            referencedRelation: "job_applicants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "new_hires_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "new_hires_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "new_hires_preceptor_id_fkey";
            columns: ["preceptor_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "new_hires_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_attempts: {
        Row: {
          actor: string;
          attempt_no: number;
          channel: string;
          created_at: string;
          employee_id: string | null;
          error: string;
          id: string;
          message_id: string | null;
          status: string;
          to_address: string;
        };
        Insert: {
          actor?: string;
          attempt_no?: number;
          channel?: string;
          created_at?: string;
          employee_id?: string | null;
          error?: string;
          id?: string;
          message_id?: string | null;
          status?: string;
          to_address?: string;
        };
        Update: {
          actor?: string;
          attempt_no?: number;
          channel?: string;
          created_at?: string;
          employee_id?: string | null;
          error?: string;
          id?: string;
          message_id?: string | null;
          status?: string;
          to_address?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_attempts_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_attempts_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "message_outbox";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_rules: {
        Row: {
          category: string;
          created_at: string;
          employee_id: string | null;
          id: string;
          in_app: boolean;
          role: Database["public"]["Enums"]["app_role"] | null;
          scope: string;
          sms: boolean;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          employee_id?: string | null;
          id?: string;
          in_app?: boolean;
          role?: Database["public"]["Enums"]["app_role"] | null;
          scope?: string;
          sms?: boolean;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          employee_id?: string | null;
          id?: string;
          in_app?: boolean;
          role?: Database["public"]["Enums"]["app_role"] | null;
          scope?: string;
          sms?: boolean;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_rules_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          audience: string;
          body: string;
          created_at: string;
          employee_id: string | null;
          id: string;
          read: boolean;
          title: string;
        };
        Insert: {
          audience?: string;
          body: string;
          created_at?: string;
          employee_id?: string | null;
          id?: string;
          read?: boolean;
          title: string;
        };
        Update: {
          audience?: string;
          body?: string;
          created_at?: string;
          employee_id?: string | null;
          id?: string;
          read?: boolean;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_phase_status: {
        Row: {
          completed_at: string | null;
          created_at: string;
          due_on: string | null;
          id: string;
          last_reminded_on: string | null;
          new_hire_id: string;
          note: string;
          phase: string;
          reminder_count: number;
          started_at: string | null;
          status: string | null;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          due_on?: string | null;
          id?: string;
          last_reminded_on?: string | null;
          new_hire_id: string;
          note?: string;
          phase: string;
          reminder_count?: number;
          started_at?: string | null;
          status?: string | null;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          due_on?: string | null;
          id?: string;
          last_reminded_on?: string | null;
          new_hire_id?: string;
          note?: string;
          phase?: string;
          reminder_count?: number;
          started_at?: string | null;
          status?: string | null;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_phase_status_new_hire_id_fkey";
            columns: ["new_hire_id"];
            isOneToOne: false;
            referencedRelation: "new_hires";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_periods: {
        Row: {
          created_at: string;
          end_date: string;
          exported_at: string | null;
          id: string;
          start_date: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          exported_at?: string | null;
          id?: string;
          start_date: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          exported_at?: string | null;
          id?: string;
          start_date?: string;
          status?: string;
        };
        Relationships: [];
      };
      point_buybacks: {
        Row: {
          created_at: string;
          employee_id: string;
          id: string;
          points_removed: number;
          reason: string;
          shifts_used: number;
        };
        Insert: {
          created_at?: string;
          employee_id: string;
          id?: string;
          points_removed: number;
          reason?: string;
          shifts_used: number;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          id?: string;
          points_removed?: number;
          reason?: string;
          shifts_used?: number;
        };
        Relationships: [
          {
            foreignKeyName: "point_buybacks_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      pto_requests: {
        Row: {
          auto_rejected: boolean;
          decision_note: string | null;
          employee_id: string;
          end_date: string;
          id: string;
          reason: string | null;
          start_date: string;
          status: Database["public"]["Enums"]["request_status"];
          submitted_at: string;
        };
        Insert: {
          auto_rejected?: boolean;
          decision_note?: string | null;
          employee_id: string;
          end_date: string;
          id?: string;
          reason?: string | null;
          start_date: string;
          status?: Database["public"]["Enums"]["request_status"];
          submitted_at?: string;
        };
        Update: {
          auto_rejected?: boolean;
          decision_note?: string | null;
          employee_id?: string;
          end_date?: string;
          id?: string;
          reason?: string | null;
          start_date?: string;
          status?: Database["public"]["Enums"]["request_status"];
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pto_requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      punch_devices: {
        Row: {
          created_at: string;
          device_key: string;
          id: string;
          is_active: boolean;
          last_seen_at: string | null;
          name: string;
          unit_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          device_key: string;
          id?: string;
          is_active?: boolean;
          last_seen_at?: string | null;
          name: string;
          unit_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          device_key?: string;
          id?: string;
          is_active?: boolean;
          last_seen_at?: string | null;
          name?: string;
          unit_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "punch_devices_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      recognitions: {
        Row: {
          badge: string;
          created_at: string;
          employee_id: string;
          from_employee_id: string | null;
          id: string;
          message: string;
          points: number;
        };
        Insert: {
          badge?: string;
          created_at?: string;
          employee_id: string;
          from_employee_id?: string | null;
          id?: string;
          message?: string;
          points?: number;
        };
        Update: {
          badge?: string;
          created_at?: string;
          employee_id?: string;
          from_employee_id?: string | null;
          id?: string;
          message?: string;
          points?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recognitions_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recognitions_from_employee_id_fkey";
            columns: ["from_employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      reward_ledger: {
        Row: {
          created_at: string;
          employee_id: string;
          id: string;
          points: number;
          reason: string;
        };
        Insert: {
          created_at?: string;
          employee_id: string;
          id?: string;
          points: number;
          reason: string;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          id?: string;
          points?: number;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reward_ledger_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_templates: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          name: string;
          pattern: Json;
          position: Database["public"]["Enums"]["position_type"] | null;
          shift: Database["public"]["Enums"]["shift_type"] | null;
          unit_id: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          name: string;
          pattern?: Json;
          position?: Database["public"]["Enums"]["position_type"] | null;
          shift?: Database["public"]["Enums"]["shift_type"] | null;
          unit_id?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          pattern?: Json;
          position?: Database["public"]["Enums"]["position_type"] | null;
          shift?: Database["public"]["Enums"]["shift_type"] | null;
          unit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_templates_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      screening_checks: {
        Row: {
          completed_on: string | null;
          created_at: string;
          employee_id: string | null;
          id: string;
          kind: string;
          new_hire_id: string | null;
          notes: string;
          ordered_on: string | null;
          reference: string;
          result: string;
          status: string;
          updated_at: string;
          vendor: string;
        };
        Insert: {
          completed_on?: string | null;
          created_at?: string;
          employee_id?: string | null;
          id?: string;
          kind: string;
          new_hire_id?: string | null;
          notes?: string;
          ordered_on?: string | null;
          reference?: string;
          result?: string;
          status?: string;
          updated_at?: string;
          vendor?: string;
        };
        Update: {
          completed_on?: string | null;
          created_at?: string;
          employee_id?: string | null;
          id?: string;
          kind?: string;
          new_hire_id?: string | null;
          notes?: string;
          ordered_on?: string | null;
          reference?: string;
          result?: string;
          status?: string;
          updated_at?: string;
          vendor?: string;
        };
        Relationships: [
          {
            foreignKeyName: "screening_checks_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "screening_checks_new_hire_id_fkey";
            columns: ["new_hire_id"];
            isOneToOne: false;
            referencedRelation: "new_hires";
            referencedColumns: ["id"];
          },
        ];
      };
      security_incidents: {
        Row: {
          created_at: string;
          detected_at: string;
          detected_by: string;
          follow_up: string | null;
          id: string;
          impact: string | null;
          remediation: string | null;
          resolved_at: string | null;
          severity: string;
          status: string;
          summary: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          detected_at?: string;
          detected_by: string;
          follow_up?: string | null;
          id?: string;
          impact?: string | null;
          remediation?: string | null;
          resolved_at?: string | null;
          severity?: string;
          status?: string;
          summary: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          detected_at?: string;
          detected_by?: string;
          follow_up?: string | null;
          id?: string;
          impact?: string | null;
          remediation?: string | null;
          resolved_at?: string | null;
          severity?: string;
          status?: string;
          summary?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      setup_steps: {
        Row: {
          completed_at: string | null;
          completed_by: string;
          created_at: string;
          detail: string;
          id: string;
          key: string;
          notes: string;
          sort_order: number;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          completed_by?: string;
          created_at?: string;
          detail?: string;
          id?: string;
          key: string;
          notes?: string;
          sort_order?: number;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          completed_by?: string;
          created_at?: string;
          detail?: string;
          id?: string;
          key?: string;
          notes?: string;
          sort_order?: number;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shift_assignments: {
        Row: {
          agency_id: string | null;
          agency_staff_id: string | null;
          created_at: string;
          created_by_ai: boolean;
          employee_id: string | null;
          fill_reason: string | null;
          float_reason: string | null;
          home_unit_id: string | null;
          hours: number;
          id: string;
          is_float: boolean;
          is_overtime: boolean;
          is_training: boolean;
          note: string | null;
          position: Database["public"]["Enums"]["position_type"];
          preceptor_id: string | null;
          prev_note: string | null;
          shift: Database["public"]["Enums"]["shift_type"];
          shift_date: string;
          status: Database["public"]["Enums"]["assignment_status"];
          unit_id: string;
        };
        Insert: {
          agency_id?: string | null;
          agency_staff_id?: string | null;
          created_at?: string;
          created_by_ai?: boolean;
          employee_id?: string | null;
          fill_reason?: string | null;
          float_reason?: string | null;
          home_unit_id?: string | null;
          hours?: number;
          id?: string;
          is_float?: boolean;
          is_overtime?: boolean;
          is_training?: boolean;
          note?: string | null;
          position: Database["public"]["Enums"]["position_type"];
          preceptor_id?: string | null;
          prev_note?: string | null;
          shift: Database["public"]["Enums"]["shift_type"];
          shift_date: string;
          status?: Database["public"]["Enums"]["assignment_status"];
          unit_id: string;
        };
        Update: {
          agency_id?: string | null;
          agency_staff_id?: string | null;
          created_at?: string;
          created_by_ai?: boolean;
          employee_id?: string | null;
          fill_reason?: string | null;
          float_reason?: string | null;
          home_unit_id?: string | null;
          hours?: number;
          id?: string;
          is_float?: boolean;
          is_overtime?: boolean;
          is_training?: boolean;
          note?: string | null;
          position?: Database["public"]["Enums"]["position_type"];
          preceptor_id?: string | null;
          prev_note?: string | null;
          shift?: Database["public"]["Enums"]["shift_type"];
          shift_date?: string;
          status?: Database["public"]["Enums"]["assignment_status"];
          unit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shift_assignments_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_agency_staff_id_fkey";
            columns: ["agency_staff_id"];
            isOneToOne: false;
            referencedRelation: "agency_staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_home_unit_id_fkey";
            columns: ["home_unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_preceptor_id_fkey";
            columns: ["preceptor_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_claim_offers: {
        Row: {
          assignment_id: string;
          batch_id: string;
          created_at: string;
          employee_id: string;
          expires_at: string;
          id: string;
          phone: string;
          reason: string;
          reply_code: string;
          responded_at: string | null;
          sent_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          assignment_id: string;
          batch_id: string;
          created_at?: string;
          employee_id: string;
          expires_at?: string;
          id?: string;
          phone?: string;
          reason?: string;
          reply_code?: string;
          responded_at?: string | null;
          sent_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          assignment_id?: string;
          batch_id?: string;
          created_at?: string;
          employee_id?: string;
          expires_at?: string;
          id?: string;
          phone?: string;
          reason?: string;
          reply_code?: string;
          responded_at?: string | null;
          sent_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shift_claim_offers_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "shift_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_claim_offers_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_switches: {
        Row: {
          assignment_id: string;
          covering_confirmed: boolean;
          covering_id: string;
          created_at: string;
          id: string;
          reason: string | null;
          requester_confirmed: boolean;
          requester_id: string;
          status: Database["public"]["Enums"]["request_status"];
          validation_notes: string | null;
        };
        Insert: {
          assignment_id: string;
          covering_confirmed?: boolean;
          covering_id: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
          requester_confirmed?: boolean;
          requester_id: string;
          status?: Database["public"]["Enums"]["request_status"];
          validation_notes?: string | null;
        };
        Update: {
          assignment_id?: string;
          covering_confirmed?: boolean;
          covering_id?: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
          requester_confirmed?: boolean;
          requester_id?: string;
          status?: Database["public"]["Enums"]["request_status"];
          validation_notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shift_switches_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "shift_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_switches_covering_id_fkey";
            columns: ["covering_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_switches_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      staffing_alerts: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          position: Database["public"]["Enums"]["position_type"] | null;
          severity: string;
          shift: Database["public"]["Enums"]["shift_type"] | null;
          shift_date: string | null;
          status: string;
          unit_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          position?: Database["public"]["Enums"]["position_type"] | null;
          severity?: string;
          shift?: Database["public"]["Enums"]["shift_type"] | null;
          shift_date?: string | null;
          status?: string;
          unit_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          position?: Database["public"]["Enums"]["position_type"] | null;
          severity?: string;
          shift?: Database["public"]["Enums"]["shift_type"] | null;
          shift_date?: string | null;
          status?: string;
          unit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "staffing_alerts_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      staffing_requirements: {
        Row: {
          id: string;
          position: Database["public"]["Enums"]["position_type"];
          required_count: number;
          shift: Database["public"]["Enums"]["shift_type"];
          unit_id: string;
        };
        Insert: {
          id?: string;
          position: Database["public"]["Enums"]["position_type"];
          required_count: number;
          shift: Database["public"]["Enums"]["shift_type"];
          unit_id: string;
        };
        Update: {
          id?: string;
          position?: Database["public"]["Enums"]["position_type"];
          required_count?: number;
          shift?: Database["public"]["Enums"]["shift_type"];
          unit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staffing_requirements_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      time_punches: {
        Row: {
          assignment_id: string | null;
          clock_in: string | null;
          clock_out: string | null;
          created_at: string;
          date: string;
          device_id: string | null;
          employee_id: string;
          exception: string | null;
          id: string;
          minutes_worked: number;
          source: string;
        };
        Insert: {
          assignment_id?: string | null;
          clock_in?: string | null;
          clock_out?: string | null;
          created_at?: string;
          date: string;
          device_id?: string | null;
          employee_id: string;
          exception?: string | null;
          id?: string;
          minutes_worked?: number;
          source?: string;
        };
        Update: {
          assignment_id?: string | null;
          clock_in?: string | null;
          clock_out?: string | null;
          created_at?: string;
          date?: string;
          device_id?: string | null;
          employee_id?: string;
          exception?: string | null;
          id?: string;
          minutes_worked?: number;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_punches_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "shift_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_punches_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "punch_devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_punches_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      units: {
        Row: {
          facility_id: string | null;
          id: string;
          name: string;
          sort_order: number;
          target_hppd: number;
        };
        Insert: {
          facility_id?: string | null;
          id?: string;
          name: string;
          sort_order?: number;
          target_hppd?: number;
        };
        Update: {
          facility_id?: string | null;
          id?: string;
          name?: string;
          sort_order?: number;
          target_hppd?: number;
        };
        Relationships: [
          {
            foreignKeyName: "units_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facilities";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      wage_advances: {
        Row: {
          amount: number;
          employee_id: string;
          id: string;
          note: string;
          requested_at: string;
          status: string;
        };
        Insert: {
          amount: number;
          employee_id: string;
          id?: string;
          note?: string;
          requested_at?: string;
          status?: string;
        };
        Update: {
          amount?: number;
          employee_id?: string;
          id?: string;
          note?: string;
          requested_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wage_advances_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_employee_id: { Args: never; Returns: string };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_manager: { Args: { _user_id: string }; Returns: boolean };
    };
    Enums: {
      app_role: "employee" | "manager" | "admin";
      assignment_status:
        "scheduled" | "completed" | "called_off" | "open" | "swapped" | "cancelled";
      attendance_kind: "late" | "call_off";
      position_type: "nurse" | "cna" | "qma";
      request_status: "pending" | "approved" | "rejected" | "cancelled";
      shift_type: "first" | "second" | "third";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["employee", "manager", "admin"],
      assignment_status: ["scheduled", "completed", "called_off", "open", "swapped", "cancelled"],
      attendance_kind: ["late", "call_off"],
      position_type: ["nurse", "cna", "qma"],
      request_status: ["pending", "approved", "rejected", "cancelled"],
      shift_type: ["first", "second", "third"],
    },
  },
} as const;
