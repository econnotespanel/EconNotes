import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  FileText,
  ExternalLink,
  BookOpen,
  Filter,
  X,
  Sparkles,
  Layers,
  GraduationCap,
  Calendar,
  CheckCircle2,
  FileCode2
} from 'lucide-react';
import { EMERGENCY_NOTES, EmergencyNote } from '@/data/emergencyNotes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const EmergencyNotesArchive: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const [selectedCourse, setSelectedCourse] = useState<string>('all');

  // List of distinct courses for filter dropdown
  const distinctCourses = useMemo(() => {
    const set = new Set<string>();
    EMERGENCY_NOTES.forEach((n) => set.add(n.course));
    return Array.from(set).sort();
  }, []);

  // Filtered notes based on search, grade, and course
  const filteredNotes = useMemo(() => {
    return EMERGENCY_NOTES.filter((note) => {
      // Grade filter
      if (selectedGrade !== 'all' && note.grade !== selectedGrade) {
        return false;
      }
      // Course filter
      if (selectedCourse !== 'all' && note.course !== selectedCourse) {
        return false;
      }
      // Search query filter (search in title, description, course, semester, department)
      if (searchQuery.trim()) {
        const query = searchQuery.toLocaleLowerCase('tr-TR');
        const matchTitle = note.title.toLocaleLowerCase('tr-TR').includes(query);
        const matchCourse = note.course.toLocaleLowerCase('tr-TR').includes(query);
        const matchDesc = note.description.toLocaleLowerCase('tr-TR').includes(query);
        const matchSemester = note.semester.toLocaleLowerCase('tr-TR').includes(query);
        if (!matchTitle && !matchCourse && !matchDesc && !matchSemester) {
          return false;
        }
      }
      return true;
    });
  }, [searchQuery, selectedGrade, selectedCourse]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedGrade('all');
    setSelectedCourse('all');
  };

  const gradeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: EMERGENCY_NOTES.length, 1: 0, 2: 0, 3: 0 };
    EMERGENCY_NOTES.forEach((n) => {
      if (counts[n.grade] !== undefined) {
        counts[n.grade]++;
      }
    });
    return counts;
  }, []);

  return (
    <section className="bg-card rounded-2xl shadow-xl border border-border p-4 sm:p-8 space-y-6">
      
      {/* Header with Title and Live Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-base sm:text-xl font-bold text-foreground tracking-tight">
              Acil Vize Ders Notları Arşivi
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-10 sm:pl-11">
            Sunucu bakımı süresince vize sınavlarınıza kesintisiz çalışabilmeniz için tüm ders notları doğrudan açık erişime sunulmuştur. Giriş yapmadan hemen inceleyebilir veya indirebilirsiniz.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 pl-10 sm:pl-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3.5 w-3.5" />
            33 Not Açık Erişimde
          </span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Ders adı, konu veya hafta ara... (örn: Makro, İstatistik, Ekonometri)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-9 h-10 sm:h-11 text-xs sm:text-sm bg-background border-border rounded-xl"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Aramayı temizle"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Pills (Grade Selection) & Course Select */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {/* Grade filter pills */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setSelectedGrade('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedGrade === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Tüm Sınıflar ({gradeCounts.all})
            </button>
            <button
              onClick={() => setSelectedGrade(1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedGrade === 1
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              1. Sınıf ({gradeCounts[1] || 0})
            </button>
            <button
              onClick={() => setSelectedGrade(2)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedGrade === 2
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              2. Sınıf ({gradeCounts[2] || 0})
            </button>
            <button
              onClick={() => setSelectedGrade(3)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedGrade === 3
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              3. Sınıf ({gradeCounts[3] || 0})
            </button>
          </div>

          {/* Course filter select */}
          <div className="w-full sm:w-auto">
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="w-full sm:w-auto h-8 px-2.5 rounded-lg text-xs bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">Tüm Dersler ({distinctCourses.length})</option>
              {distinctCourses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results Count Bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>
          Toplam <strong className="text-foreground">{filteredNotes.length}</strong> ders notu listeleniyor
        </span>
        {(searchQuery || selectedGrade !== 'all' || selectedCourse !== 'all') && (
          <button
            onClick={resetFilters}
            className="text-primary hover:underline font-medium inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Filtreleri Temizle
          </button>
        )}
      </div>

      {/* Notes Grid */}
      {filteredNotes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          {filteredNotes.map((note) => {
            const isPptx = note.fileName.endsWith('.pptx') || note.fileType.includes('presentation');
            return (
              <div
                key={note.id}
                className="group relative flex flex-col justify-between bg-muted/40 hover:bg-muted/70 rounded-xl border border-border/80 hover:border-primary/40 p-4 transition-all duration-200 shadow-sm hover:shadow"
              >
                <div className="space-y-2.5">
                  {/* Badges: Grade & Semester */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold bg-primary/10 text-primary">
                        {note.grade}. Sınıf
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium bg-muted text-muted-foreground border border-border/50">
                        {note.course}
                      </span>
                    </div>
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground font-mono">
                      {note.fileSize}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h4 className="text-sm sm:text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {note.title}
                    </h4>
                    {note.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {note.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer Details & Action Buttons */}
                <div className="pt-3.5 mt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span className="truncate">{note.semester}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={note.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-xs gap-1 font-medium bg-background hover:bg-primary hover:text-primary-foreground border-border"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Aç</span>
                      </Button>
                    </a>

                    <a
                      href={note.downloadUrl}
                      download={note.fileName}
                      className="inline-flex"
                    >
                      <Button
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1 font-medium shadow-sm"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>İndir</span>
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-10 px-4 rounded-xl border border-dashed border-border bg-muted/20">
          <div className="h-10 w-10 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
            <Search className="h-5 w-5" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">
            Aramanızla eşleşen ders notu bulunamadı
          </h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Farklı bir arama terimi deneyebilir veya filtreleri sıfırlayabilirsiniz.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={resetFilters}
            className="mt-4 text-xs"
          >
            Filtreleri Temizle
          </Button>
        </div>
      )}

      {/* Info Callout */}
      <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Tüm notlar doğrudan üniversite müfredatı ve haftalık ders içeriklerine göre hazırlanmıştır. Dosyaları cihazınıza kaydedip internet bağlantınız olmasa dahi dilediğiniz zaman çalışabilirsiniz.
        </p>
      </div>

    </section>
  );
};

export default EmergencyNotesArchive;
