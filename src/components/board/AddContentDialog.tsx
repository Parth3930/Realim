import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { type ElementType } from '../../lib/store';

interface AddContentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pendingTool: ElementType | null;
    onSubmit: (content: string, type: ElementType) => void;
}

export function AddContentDialog({ open, onOpenChange, pendingTool, onSubmit }: AddContentDialogProps) {
    const [inputValue, setInputValue] = useState('');

    const handleSubmit = () => {
        const content = inputValue || (pendingTool === 'sticky' ? 'New Note' : 'Content');
        if (pendingTool) {
            onSubmit(content, pendingTool);
        }
        setInputValue('');
        onOpenChange(false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (typeof ev.target?.result === 'string') {
                    setInputValue(ev.target.result);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="glass border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle>Add Content</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Label className="mb-2 block text-muted-foreground">
                        {pendingTool === 'image' ? 'Image Link or Upload' : pendingTool === 'music' ? 'YouTube Link or Upload Audio' : 'Text'}
                    </Label>
                    {pendingTool === 'text' || pendingTool === 'sticky' ? (
                        <textarea
                            className="flex min-h-[120px] w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Type here..."
                            autoFocus
                        />
                    ) : pendingTool === 'music' ? (
                        <div className="space-y-3">
                            <Input
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="https://youtube.com/watch?v=..."
                                autoFocus
                            />
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-white/10" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-[#0f0f11] px-2 text-muted-foreground">Or upload audio</span>
                                </div>
                            </div>
                            <Input
                                type="file"
                                accept="audio/*"
                                onChange={handleFileSelect}
                                className="cursor-pointer file:cursor-pointer file:text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium"
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <Input
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="https://..."
                                autoFocus
                            />
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-white/10" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-[#0f0f11] px-2 text-muted-foreground">Or upload</span>
                                </div>
                            </div>
                            <Input
                                type="file"
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="cursor-pointer file:cursor-pointer file:text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium"
                            />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>Add to Board</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
