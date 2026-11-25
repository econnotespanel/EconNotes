// Security Notice: Direct public Supabase Storage URLs and uploader UUIDs were removed
// from the frontend bundle to prevent authentication, download quota, and watermark bypasses.
// All platform notes are served exclusively through authenticated, RLS-protected queries.

export interface EmergencyNote {
  id: string;
  title: string;
  description: string;
  department: string;
  grade: number;
  course: string;
  semester: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  downloadUrl: string;
  uploaderName: string;
  createdAt: string;
}

export const EMERGENCY_NOTES: EmergencyNote[] = [];
