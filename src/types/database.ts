/**
 * Supabase Database Type Definitions
 * 
 * These types represent the database schema for type-safe Supabase queries.
 * Generated based on the OSINT schema migrations from Plan 1.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      org_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'analyst' | 'member';
          joined_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'analyst' | 'member';
          joined_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: 'owner' | 'admin' | 'analyst' | 'member';
          joined_at?: string;
        };
      };
      sources: {
        Row: {
          id: string;
          organization_id: string;
          source_type: 'rss' | 'api' | 'email' | 'manual';
          name: string;
          url: string | null;
          reliability_rating: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
          notes: string | null;
          created_at: string;
          updated_at: string;
          // Phase 1: Retention policy configuration
          retention_max_items: number | null;
          retention_days: number | null;
          retention_action: 'delete' | 'archive';
        };
        Insert: {
          id?: string;
          organization_id: string;
          source_type: 'rss' | 'api' | 'email' | 'manual';
          name: string;
          url?: string | null;
          reliability_rating?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          // Phase 1: Retention policy configuration
          retention_max_items?: number | null;
          retention_days?: number | null;
          retention_action?: 'delete' | 'archive';
        };
        Update: {
          id?: string;
          organization_id?: string;
          source_type?: 'rss' | 'api' | 'email' | 'manual';
          name?: string;
          url?: string | null;
          reliability_rating?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          // Phase 1: Retention policy configuration
          retention_max_items?: number | null;
          retention_days?: number | null;
          retention_action?: 'delete' | 'archive';
        };
      };
      source_records: {
        Row: {
          id: string;
          source_id: string;
          title: string;
          url: string | null;
          content: string | null;
          published_at: string | null;
          ingested_at: string;
          language: string | null;
          geographic_indicators: Json | null;
          raw_metadata: Json | null;
          initial_confidence_flags: Json | null;
          // Phase 1: Content optimization and media types
          media_type: 'article' | 'video' | 'podcast' | 'audio' | 'other';
          content_type: 'full_text' | 'summary' | 'structured' | 'minimal';
          content_compressed: boolean;
          content_length: number | null;
          storage_optimized_at: string | null;
        };
        Insert: {
          id?: string;
          source_id: string;
          title: string;
          url?: string | null;
          content?: string | null;
          published_at?: string | null;
          ingested_at?: string;
          language?: string | null;
          geographic_indicators?: Json | null;
          raw_metadata?: Json | null;
          initial_confidence_flags?: Json | null;
          // Phase 1: Content optimization and media types
          media_type?: 'article' | 'video' | 'podcast' | 'audio' | 'other';
          content_type?: 'full_text' | 'summary' | 'structured' | 'minimal';
          content_compressed?: boolean;
          content_length?: number | null;
          storage_optimized_at?: string | null;
        };
        Update: {
          id?: string;
          source_id?: string;
          title?: string;
          url?: string | null;
          content?: string | null;
          published_at?: string | null;
          ingested_at?: string;
          language?: string | null;
          geographic_indicators?: Json | null;
          raw_metadata?: Json | null;
          initial_confidence_flags?: Json | null;
          // Phase 1: Content optimization and media types
          media_type?: 'article' | 'video' | 'podcast' | 'audio' | 'other';
          content_type?: 'full_text' | 'summary' | 'structured' | 'minimal';
          content_compressed?: boolean;
          content_length?: number | null;
          storage_optimized_at?: string | null;
        };
      };
      osint_topics: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          keywords: Json;
          related_topics: Json;
          geographic_analysis: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          keywords?: Json;
          related_topics?: Json;
          geographic_analysis?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          keywords?: Json;
          related_topics?: Json;
          geographic_analysis?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      topic_source_links: {
        Row: {
          id: string;
          topic_id: string;
          source_record_id: string;
          relevance_score: number | null;
          confidence_level: 'HIGH' | 'MEDIUM' | 'LOW' | null;
          assumptions: string | null;
          analyst_notes: string | null;
          linked_by_user_id: string | null;
          linked_at: string;
        };
        Insert: {
          id?: string;
          topic_id: string;
          source_record_id: string;
          relevance_score?: number | null;
          confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
          assumptions?: string | null;
          analyst_notes?: string | null;
          linked_by_user_id?: string | null;
          linked_at?: string;
        };
        Update: {
          id?: string;
          topic_id?: string;
          source_record_id?: string;
          relevance_score?: number | null;
          confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
          assumptions?: string | null;
          analyst_notes?: string | null;
          linked_by_user_id?: string | null;
          linked_at?: string;
        };
      };
      analytic_artifacts: {
        Row: {
          id: string;
          source_record_id: string | null;
          topic_id: string | null;
          organization_id: string;
          type: 'summary' | 'entity_extraction' | 'tone_analysis' | 'sentiment' | 'key_facts' | 'timeline' | 'network_graph';
          payload: Json;
          model_name: string;
          reviewed: boolean;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_record_id?: string | null;
          topic_id?: string | null;
          organization_id: string;
          type: 'summary' | 'entity_extraction' | 'tone_analysis' | 'sentiment' | 'key_facts' | 'timeline' | 'network_graph';
          payload: Json;
          model_name: string;
          reviewed?: boolean;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_record_id?: string | null;
          topic_id?: string | null;
          organization_id?: string;
          type?: 'summary' | 'entity_extraction' | 'tone_analysis' | 'sentiment' | 'key_facts' | 'timeline' | 'network_graph';
          payload?: Json;
          model_name?: string;
          reviewed?: boolean;
          created_by?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      osint_source_type: 'rss' | 'api' | 'email' | 'manual';
      reliability_rating: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
      confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
      artifact_type: 'summary' | 'entity_extraction' | 'tone_analysis' | 'sentiment' | 'key_facts' | 'timeline' | 'network_graph';
      org_member_role: 'owner' | 'admin' | 'analyst' | 'member';
    };
  };
}

