export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      faqs: {
        Row: {
          answer: string
          audience: string
          category: string
          created_at: string
          created_by: string
          id: string
          question: string
          sort_order: number
          updated_at: string
          updated_by: string
          user_groups: string[] | null
        }
        Insert: {
          answer: string
          audience: string
          category: string
          created_at?: string
          created_by: string
          id?: string
          question: string
          sort_order?: number
          updated_at?: string
          updated_by: string
          user_groups?: string[] | null
        }
        Update: {
          answer?: string
          audience?: string
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          question?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string
          user_groups?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "faqs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faqs_updated_by_fkey"
            columns: ["updated_by"]
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
          inbound_items: Json
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
          inbound_items?: Json
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
          inbound_items?: Json
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
          upload_type: string
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
          upload_type?: string
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
          upload_type?: string
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
      password_reset_attempts: {
        Row: {
          id: number
          ip_hash: string
          lookup_hash: string
          occurred_at: string
          success: boolean
        }
        Insert: {
          id?: number
          ip_hash: string
          lookup_hash: string
          occurred_at?: string
          success?: boolean
        }
        Update: {
          id?: number
          ip_hash?: string
          lookup_hash?: string
          occurred_at?: string
          success?: boolean
        }
        Relationships: []
      }
      password_reset_challenges: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          ip_hash: string
          lookup_hash: string
          token_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          ip_hash: string
          lookup_hash: string
          token_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_hash?: string
          lookup_hash?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_challenges_user_id_fkey"
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
          guide_banner_dismissed_at: string | null
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
          guide_banner_dismissed_at?: string | null
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
          guide_banner_dismissed_at?: string | null
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
      purchased_inventory_lot_adjustments: {
        Row: {
          action: string
          after_admin_memo: string | null
          after_option_name: string
          after_product_name: string
          after_remaining_quantity: number
          before_admin_memo: string | null
          before_option_name: string | null
          before_product_name: string | null
          before_remaining_quantity: number | null
          created_at: string
          created_by: string
          id: string
          lot_id: string
          user_id: string
        }
        Insert: {
          action: string
          after_admin_memo?: string | null
          after_option_name?: string
          after_product_name: string
          after_remaining_quantity: number
          before_admin_memo?: string | null
          before_option_name?: string | null
          before_product_name?: string | null
          before_remaining_quantity?: number | null
          created_at?: string
          created_by: string
          id?: string
          lot_id: string
          user_id: string
        }
        Update: {
          action?: string
          after_admin_memo?: string | null
          after_option_name?: string
          after_product_name?: string
          after_remaining_quantity?: number
          before_admin_memo?: string | null
          before_option_name?: string | null
          before_product_name?: string | null
          before_remaining_quantity?: number | null
          created_at?: string
          created_by?: string
          id?: string
          lot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchased_inventory_lot_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchased_inventory_lot_adjustments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "purchased_inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchased_inventory_lot_adjustments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchased_inventory_lots: {
        Row: {
          created_at: string
          id: string
          inbound_request_id: string | null
          initial_quantity: number
          option_name: string
          product_name: string
          remaining_quantity: number
          row_number: number
          source_type: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inbound_request_id?: string | null
          initial_quantity: number
          option_name?: string
          product_name: string
          remaining_quantity: number
          row_number: number
          source_type?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inbound_request_id?: string | null
          initial_quantity?: number
          option_name?: string
          product_name?: string
          remaining_quantity?: number
          row_number?: number
          source_type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchased_inventory_lots_inbound_request_id_fkey"
            columns: ["inbound_request_id"]
            isOneToOne: false
            referencedRelation: "inbound_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchased_inventory_lots_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchased_inventory_lots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchased_shipping_allocations: {
        Row: {
          created_at: string
          id: string
          item_no: number
          lot_id: string
          quantity: number
          upload_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_no: number
          lot_id: string
          quantity: number
          upload_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_no?: number
          lot_id?: string
          quantity?: number
          upload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchased_shipping_allocations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "purchased_inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchased_shipping_allocations_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "order_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchased_shipping_allocations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      support_request_attachments: {
        Row: {
          content_type: string
          created_at: string
          id: string
          original_name: string
          request_id: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          id?: string
          original_name: string
          request_id: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          original_name?: string
          request_id?: string
          size_bytes?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "support_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_request_attachments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_request_comments: {
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
            foreignKeyName: "support_request_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "support_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          admin_last_read_at: string | null
          body: string
          category: string
          created_at: string
          id: string
          last_comment_at: string | null
          last_comment_by_role: string | null
          reference_type: string
          reference_value: string | null
          reviewed_by: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          user_last_read_at: string | null
        }
        Insert: {
          admin_last_read_at?: string | null
          body: string
          category: string
          created_at?: string
          id?: string
          last_comment_at?: string | null
          last_comment_by_role?: string | null
          reference_type?: string
          reference_value?: string | null
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
          category?: string
          created_at?: string
          id?: string
          last_comment_at?: string | null
          last_comment_by_role?: string | null
          reference_type?: string
          reference_value?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          user_last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_user_id_fkey"
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
        Args: {
          request_id: string
          body: string
        }
        Returns: string
      }
      add_support_comment: {
        Args: {
          p_request_id: string
          p_body: string
        }
        Returns: string
      }
      add_user_custom_inventory: {
        Args: {
          target_user: string
          name: string
          initial_qty?: number
          memo?: string
        }
        Returns: string
      }
      adjust_balance: {
        Args: {
          target_user: string
          delta: number
          memo: string
        }
        Returns: undefined
      }
      adjust_user_custom_inventory: {
        Args: {
          target_user: string
          custom_id: string
          delta: number
          memo?: string
        }
        Returns: undefined
      }
      adjust_user_inventory: {
        Args: {
          target_user: string
          product_id: string
          delta: number
          memo?: string
        }
        Returns: undefined
      }
      admin_add_purchased_inventory_lot: {
        Args: {
          target_user: string
          product_name: string
          option_name: string
          quantity: number
          memo?: string
        }
        Returns: string
      }
      admin_update_purchased_inventory_lot: {
        Args: {
          target_user: string
          lot_id: string
          product_name: string
          option_name: string
          remaining_quantity: number
          memo?: string
        }
        Returns: undefined
      }
      apply_product_import: {
        Args: {
          rows: Json
        }
        Returns: Json
      }
      approve_order_upload: {
        Args: {
          upload_id: string
        }
        Returns: string
      }
      approve_shipping_upload: {
        Args: {
          upload_id: string
        }
        Returns: undefined
      }
      approve_stock_order: {
        Args: {
          order_id: string
        }
        Returns: undefined
      }
      attach_tracking: {
        Args: {
          upload_id: string
          storage_path: string
          parsed_items: Json
        }
        Returns: undefined
      }
      cancel_inbound_request: {
        Args: {
          request_id: string
        }
        Returns: undefined
      }
      cancel_order: {
        Args: {
          order_id: string
        }
        Returns: undefined
      }
      cancel_shipping_upload: {
        Args: {
          upload_id: string
        }
        Returns: undefined
      }
      cancel_stock_order: {
        Args: {
          order_id: string
        }
        Returns: undefined
      }
      cancel_support_request: {
        Args: {
          p_request_id: string
        }
        Returns: undefined
      }
      cleanup_failed_support_request: {
        Args: {
          p_request_id: string
        }
        Returns: undefined
      }
      cleanup_orphan_inbound_pending: {
        Args: {
          p_older_than?: unknown
        }
        Returns: number
      }
      complete_shipping_upload: {
        Args: {
          upload_id: string
        }
        Returns: undefined
      }
      confirm_deposit: {
        Args: {
          request_id: string
        }
        Returns: undefined
      }
      count_inbound_unread: {
        Args: {
          p_role: string
        }
        Returns: number
      }
      count_support_unread: {
        Args: {
          p_role: string
        }
        Returns: number
      }
      create_purchased_shipping_upload: {
        Args: {
          p_storage_path: string
          p_original_name: string
          p_contact_person: string
          p_buyer_phone: string
          p_request_memo: string
          p_items: Json
          p_total_quantity: number
          p_shipping_fee_total: number
          p_allocations: Json
        }
        Returns: string
      }
      delete_support_comment: {
        Args: {
          p_comment_id: string
        }
        Returns: string
      }
      delete_user_custom_inventory: {
        Args: {
          target_user: string
          custom_id: string
        }
        Returns: undefined
      }
      is_active: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      mark_inbound_read: {
        Args: {
          request_id: string
        }
        Returns: undefined
      }
      mark_support_read: {
        Args: {
          p_request_id: string
          p_seen_last_comment_at?: string
        }
        Returns: undefined
      }
      place_order: {
        Args: {
          items: Json
          shipping: Json
        }
        Returns: string
      }
      product_match_key: {
        Args: {
          value: string
        }
        Returns: string
      }
      rate_limit_check: {
        Args: {
          p_action: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: undefined
      }
      reject_deposit: {
        Args: {
          request_id: string
          memo: string
        }
        Returns: undefined
      }
      reject_order_upload: {
        Args: {
          upload_id: string
          memo: string
        }
        Returns: undefined
      }
      reject_shipping_upload: {
        Args: {
          upload_id: string
          memo: string
        }
        Returns: undefined
      }
      reject_stock_order: {
        Args: {
          order_id: string
          memo: string
        }
        Returns: undefined
      }
      request_stock_order: {
        Args: {
          items: Json
        }
        Returns: string
      }
      search_inbound_requests: {
        Args: {
          p_q?: string
          p_status?: string
          p_limit?: number
        }
        Returns: {
          id: string
          user_id: string
          title: string
          status: string
          last_comment_at: string
          last_comment_by_role: string
          user_last_read_at: string
          admin_last_read_at: string
          created_at: string
          updated_at: string
          profile_name: string
          profile_email: string
        }[]
      }
      search_support_requests: {
        Args: {
          p_q?: string
          p_status?: string
          p_category?: string
          p_limit?: number
        }
        Returns: {
          id: string
          user_id: string
          category: string
          title: string
          status: string
          last_comment_at: string
          last_comment_by_role: string
          user_last_read_at: string
          admin_last_read_at: string
          created_at: string
          updated_at: string
          profile_name: string
          profile_email: string
        }[]
      }
      set_inbound_status: {
        Args: {
          request_id: string
          new_status: string
        }
        Returns: undefined
      }
      set_support_status: {
        Args: {
          p_request_id: string
          p_new_status: string
        }
        Returns: undefined
      }
      submit_inbound_request_rpc:
        | {
            Args: {
              p_title: string
              p_body: string
              p_excel_path: string
              p_excel_name: string
              p_image_paths: string[]
            }
            Returns: string
          }
        | {
            Args: {
              p_title: string
              p_body: string
              p_excel_path: string
              p_excel_name: string
              p_image_paths: string[]
              p_items: Json
            }
            Returns: string
          }
      submit_support_request_rpc: {
        Args: {
          p_category: string
          p_title: string
          p_body: string
          p_reference_type?: string
          p_reference_value?: string
        }
        Returns: string
      }
      transition_order_status: {
        Args: {
          order_id: string
          next_status: string
          tracking?: string
          carrier_name?: string
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

