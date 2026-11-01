/**
 * Notes tablosundan çekilebilecek güvenli kolonlar.
 * `note_password` kolonu veritabanı seviyesinde okumaya kapalıdır; şifre kontrolü
 * `verify_note_password` fonksiyonu ile sunucu tarafında yapılır.
 */
export const NOTE_SELECT = [
  'id',
  'user_id',
  'title',
  'description',
  'grade',
  'department',
  'course',
  'semester',
  'file_url',
  'file_name',
  'file_type',
  'uploader_name',
  'created_at',
  'updated_at',
  'edited_at',
  'edited_by_name',
  'university',
  'status',
  'approved_at',
  'approved_by',
  'rejection_reason',
  'has_password',
].join(',');
