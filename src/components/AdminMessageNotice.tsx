import { ArrowRight, MessageSquareText } from 'lucide-react';
import EconLogo from '@/components/EconLogo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function AdminMessageNotice({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: () => void }) {
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
    <DialogContent className="!fixed bg-card text-card-foreground backdrop-blur-none dark:bg-card dark:border-border max-w-md">
      <EconLogo className="h-8 w-36" />
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-border bg-primary/10 text-primary"><MessageSquareText className="h-6 w-6" /></span>
      <DialogHeader>
        <DialogTitle className="font-display tracking-normal">Platform yöneticisinden bir mesajınız var.</DialogTitle>
        <DialogDescription>EconNotes yönetim ekibi size özel bir mesaj gönderdi.</DialogDescription>
      </DialogHeader>
      <Button onClick={onOpen} className="gap-2">Mesajı Destek Merkezi’nde aç <ArrowRight className="h-4 w-4 shrink-0" /></Button>
      <Button variant="ghost" onClick={onClose}>Daha sonra</Button>
    </DialogContent>
  </Dialog>;
}