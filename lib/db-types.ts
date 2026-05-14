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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          bank_account_holder: string
          bank_account_number: string
          bank_name: string
          id: number
          notice: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bank_account_holder?: string
          bank_account_number?: string
          bank_name?: string
          id: number
          notice?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bank_account_holder?: string
          bank_account_number?: string
          bank_name?: string
          id?: number
          notice?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_transactions: {
        Row: {
          admin_id: string | null
          amount: number
          balance_after: number
          created_at: string
          id: string
          memo: string | null
          ref_id: string | null
          ref_type: string | null
          type: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          memo?: string | null
          ref_id?: string | null
          ref_type?: string | null
          type: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          memo?: string | null
          ref_id?: string | null
          ref_type?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_transactions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_inventory_movements: {
        Row: {
          created_at: string
          custom_inventory_id: string
          delta: number
          id: string
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_inventory_id: string
          delta: number
          id?: string
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_inventory_id?: string
          delta?: number
          id?: string
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_inventory_movements_custom_inventory_id_fkey"
            columns: ["custom_inventory_id"]
            isOneToOne: false
            referencedRelation: "user_custom_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_inventory_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_requests: {
        Row: {
          admin_memo: string | null
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          depositor_name: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          admin_memo?: string | null
          amount: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          depositor_name: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          admin_memo?: string | null
          amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          depositor_name?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_requests_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_request_comments: {
        Row: {
          author_id: string
          author_role: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          request_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_role: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          request_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_request_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "inbound_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_requests: {
        Row: {
          admin_last_read_at: string | null
          body: string
          created_at: string
          excel_original_name: string
          excel_storage_path: string
          id: string
          image_paths: string[]
          last_comment_at: string | null
          last_comment_by_role: string | null
          reviewed_by: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          user_last_read_at: string | null
        }
        Insert: {
          admin_last_read_at?: string | null
          body?: string
          created_at?: string
          excel_original_name: string
          excel_storage_path: string
          id?: string
          image_paths?: string[]
          last_comment_at?: string | null
          last_comment_by_role?: string | null
          reviewed_by?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          user_last_read_at?: string | null
        }
        Update: {
          admin_last_read_at?: string | null
          body?: string
          created_at?: string
          excel_original_name?: string
          excel_storage_path?: string
          id?: string
          image_paths?: string[]
          last_comment_at?: string | null
          last_comment_by_role?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          user_last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          delta: number
          id: string
          product_id: string
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          product_id: string
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          product_id?: string
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_uploads: {
        Row: {
          admin_memo: string | null
          admin_storage_path: string | null
          buyer_email: string | null
          buyer_order_number: string | null
          buyer_phone: string | null
          company_name: string | null
          completed_at: string | null
          contact_person: string | null
          created_at: string
          id: string
          items: Json
          order_date: string | null
          order_id: string | null
          original_name: string
          parse_error: string | null
          request_memo: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shipped_at: string | null
          shipping_address: string | null
          shipping_fee_total: number
          status: string
          storage_path: string
          total_amount: number
          total_quantity: number
          user_id: string
        }
        Insert: {
          admin_memo?: string | null
          admin_storage_path?: string | null
          buyer_email?: string | null
          buyer_order_number?: string | null
          buyer_phone?: string | null
          company_name?: string | null
          completed_at?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          items?: Json
          order_date?: string | null
          order_id?: string | null
          original_name: string
          parse_error?: string | null
          request_memo?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shipped_at?: string | null
          shipping_address?: string | null
          shipping_fee_total?: number
          status?: string
          storage_path: string
          total_amount?: number
          total_quantity?: number
          user_id: string
        }
        Update: {
          admin_memo?: string | null
          admin_storage_path?: string | null
          buyer_email?: string | null
          buyer_order_number?: string | null
          buyer_phone?: string | null
          company_name?: string | null
          completed_at?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          items?: Json
          order_date?: string | null
          order_id?: string | null
          original_name?: string
          parse_error?: string | null
          request_memo?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shipped_at?: string | null
          shipping_address?: string | null
          shipping_fee_total?: number
          status?: string
          storage_path?: string
          total_amount?: number
          total_quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_uploads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_uploads_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          carrier: string | null
          created_at: string
          id: string
          shipped_at: string | null
          shipping_address: string
          shipping_memo: string | null
          shipping_name: string
          shipping_phone: string
          status: string
          total_amount: number
          tracking_number: string | null
          user_id: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          id?: string
          shipped_at?: string | null
          shipping_address: string
          shipping_memo?: string | null
          shipping_name: string
          shipping_phone: string
          status?: string
          total_amount: number
          tracking_number?: string | null
          user_id: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          id?: string
          shipped_at?: string | null
          shipping_address?: string
          shipping_memo?: string | null
          shipping_name?: string
          shipping_phone?: string
          status?: string
          total_amount?: number
          tracking_number?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_imports: {
        Row: {
          admin_id: string
          created_at: string
          error_message: string | null
          id: string
          imported_at: string | null
          original_name: string
          preview: Json
          result: Json | null
          status: string
          storage_path: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          imported_at?: string | null
          original_name: string
          preview?: Json
          result?: Json | null
          status?: string
          storage_path: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          imported_at?: string | null
          original_name?: string
          preview?: Json
          result?: Json | null
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_imports_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string
          id: string
          image_url: string | null
          import_key: string | null
          is_active: boolean
          last_imported_at: string | null
          management_code: string | null
          name: string
          option_name: string | null
          per_user_limit: number | null
          price: number
          stock: number
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          id?: string
          image_url?: string | null
          import_key?: string | null
          is_active?: boolean
          last_imported_at?: string | null
          management_code?: string | null
          name: string
          option_name?: string | null
          per_user_limit?: number | null
          price: number
          stock?: number
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          id?: string
          image_url?: string | null
          import_key?: string | null
          is_active?: boolean
          last_imported_at?: string | null
          management_code?: string | null
          name?: string
          option_name?: string | null
          per_user_limit?: number | null
          price?: number
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved_at: string | null
          created_at: string
          deposit_balance: number
          email: string
          id: string
          low_balance_threshold: number
          name: string
          phone: string
          role: string
          status: string
          user_group: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          deposit_balance?: number
          email: string
          id: string
          low_balance_threshold?: number
          name: string
          phone: string
          role?: string
          status?: string
          user_group?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          deposit_balance?: number
          email?: string
          id?: string
          low_balance_threshold?: number
          name?: string
          phone?: string
          role?: string
          status?: string
          user_group?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          id: number
          occurred_at: string
          user_id: string
        }
        Insert: {
          action: string
          id?: number
          occurred_at?: string
          user_id: string
        }
        Update: {
          action?: string
          id?: number
          occurred_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_orders: {
        Row: {
          admin_memo: string | null
          created_at: string
          id: string
          items: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          total_amount: number
          user_id: string
        }
        Insert: {
          admin_memo?: string | null
          created_at?: string
          id?: string
          items?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_amount?: number
          user_id: string
        }
        Update: {
          admin_memo?: string | null
          created_at?: string
          id?: string
          items?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_orders_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_custom_inventory: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_inventory_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_custom_inventory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_inventory: {
        Row: {
          product_id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          product_id: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          product_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_inventory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_inbound_comment: {
        Args: { body: string; request_id: string }
        Returns: string
      }
      add_user_custom_inventory: {
        Args: {
          initial_qty?: number
          memo?: string
          name: string
          target_user: string
        }
        Returns: string
      }
      adjust_balance: {
        Args: { delta: number; memo: string; target_user: string }
        Returns: undefined
      }
      adjust_user_custom_inventory: {
        Args: {
          custom_id: string
          delta: number
          memo?: string
          target_user: string
        }
        Returns: undefined
      }
      adjust_user_inventory: {
        Args: {
          delta: number
          memo?: string
          product_id: string
          target_user: string
        }
        Returns: undefined
      }
      apply_product_import: { Args: { rows: Json }; Returns: Json }
      approve_order_upload: { Args: { upload_id: string }; Returns: string }
      approve_shipping_upload: {
        Args: { upload_id: string }
        Returns: undefined
      }
      approve_stock_order: { Args: { order_id: string }; Returns: undefined }
      attach_tracking: {
        Args: { parsed_items: Json; storage_path: string; upload_id: string }
        Returns: undefined
      }
      cancel_inbound_request: {
        Args: { request_id: string }
        Returns: undefined
      }
      cancel_order: { Args: { order_id: string }; Returns: undefined }
      cancel_shipping_upload: {
        Args: { upload_id: string }
        Returns: undefined
      }
      cancel_stock_order: { Args: { order_id: string }; Returns: undefined }
      cleanup_orphan_inbound_pending: {
        Args: { p_older_than?: string }
        Returns: number
      }
      complete_shipping_upload: {
        Args: { upload_id: string }
        Returns: undefined
      }
      confirm_deposit: { Args: { request_id: string }; Returns: undefined }
      count_inbound_unread: { Args: { p_role: string }; Returns: number }
      delete_user_custom_inventory: {
        Args: { custom_id: string; target_user: string }
        Returns: undefined
      }
      is_active: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      mark_inbound_read: { Args: { request_id: string }; Returns: undefined }
      place_order: { Args: { items: Json; shipping: Json }; Returns: string }
      rate_limit_check: {
        Args: { p_action: string; p_limit: number; p_window_seconds: number }
        Returns: undefined
      }
      reject_deposit: {
        Args: { memo: string; request_id: string }
        Returns: undefined
      }
      reject_order_upload: {
        Args: { memo: string; upload_id: string }
        Returns: undefined
      }
      reject_shipping_upload: {
        Args: { memo: string; upload_id: string }
        Returns: undefined
      }
      reject_stock_order: {
        Args: { memo: string; order_id: string }
        Returns: undefined
      }
      request_stock_order: { Args: { items: Json }; Returns: string }
      search_inbound_requests: {
        Args: { p_limit?: number; p_q?: string; p_status?: string }
        Returns: {
          admin_last_read_at: string
          created_at: string
          id: string
          last_comment_at: string
          last_comment_by_role: string
          profile_email: string
          profile_name: string
          status: string
          title: string
          updated_at: string
          user_id: string
          user_last_read_at: string
        }[]
      }
      set_inbound_status: {
        Args: { new_status: string; request_id: string }
        Returns: undefined
      }
      submit_inbound_request_rpc: {
        Args: {
          p_body: string
          p_excel_name: string
          p_excel_path: string
          p_image_paths: string[]
          p_title: string
        }
        Returns: string
      }
      transition_order_status: {
        Args: {
          carrier_name?: string
          next_status: string
          order_id: string
          tracking?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
