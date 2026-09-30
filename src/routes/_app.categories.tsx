import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Tag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fetchCategoryList, createCategory, updateCategory, deleteCategory, getCategoryProductCount } from "@/lib/data";
import { formatDate } from "@/lib/types";
import type { Category } from "@/lib/types";

export const Route = createFileRoute("/_app/categories")({
  head: () => ({ meta: [{ title: "Categories — Billova Perfumes" }] }),
  component: CategoriesPage,
});

const PAGE_SIZE = 10;

function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteMsg, setDeleteMsg] = useState("");
  const [form, setForm] = useState({ category_name: "", description: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const cats = await fetchCategoryList();
      setCategories(cats);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = q
    ? categories.filter((c) => c.category_name.toLowerCase().includes(q.toLowerCase()) || c.description?.toLowerCase().includes(q.toLowerCase()))
    : categories;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openNew = () => { setEditing(null); setForm({ category_name: "", description: "" }); setFormError(""); setDialogOpen(true); };
  const openEdit = (c: Category) => { setEditing(c); setForm({ category_name: c.category_name, description: c.description ?? "" }); setFormError(""); setDialogOpen(true); };

  const handleSave = async () => {
    setFormError("");
    if (!form.category_name.trim()) { setFormError("Category name is required."); return; }

    const dup = categories.find((c) => c.category_name.toLowerCase() === form.category_name.trim().toLowerCase() && (!editing || c.id !== editing.id));
    if (dup) { setFormError(`Category "${form.category_name}" already exists.`); return; }

    setSaving(true);
    try {
      if (editing) {
        await updateCategory(editing.id, { category_name: form.category_name.trim(), description: form.description.trim() || null });
        toast.success("Category updated");
      } else {
        await createCategory({ category_name: form.category_name.trim(), description: form.description.trim() || null });
        toast.success("Category created");
      }
      setDialogOpen(false);
      load();
    } catch (e: any) { setFormError(e?.message ?? "Error saving category"); }
    setSaving(false);
  };

  const confirmDelete = async (cat: Category) => {
    const count = await getCategoryProductCount(cat.category_name);
    if (count > 0) {
      setDeleteMsg(`This category is assigned to ${count} product${count > 1 ? "s" : ""}. Please reassign or remove those products before deleting.`);
    } else {
      setDeleteMsg("");
    }
    setDeleting(cat);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await deleteCategory(deleting.id); toast.success("Category deleted"); setDeleting(null); load(); }
    catch (e: any) { toast.error(e?.message ?? "Error deleting"); }
  };

  return (
    <>
      <AppHeader title="Categories" />
      <main className="flex-1 p-4 sm:p-6">
        <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-semibold">Category Management</h3>
              <p className="text-xs text-muted-foreground">{filtered.length} categories</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search categories" className="h-10 w-full rounded-xl pl-9 sm:w-52" />
              </div>
              <Button onClick={openNew} className="h-10 rounded-xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Category
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">{[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Category</th>
                    <th className="px-5 py-3 text-left font-medium">Description</th>
                    <th className="hidden px-5 py-3 text-left font-medium sm:table-cell">Created</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {current.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                            {c.category_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{c.category_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{c.description || "—"}</td>
                      <td className="hidden px-5 py-3.5 text-muted-foreground sm:table-cell">{formatDate(c.created_at)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => confirmDelete(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {current.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No categories found.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
            <span className="text-muted-foreground">Page {page} of {pages}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </section>
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {formError && <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>}
            <div className="space-y-1.5">
              <Label>Category Name *</Label>
              <Input value={form.category_name} onChange={(e) => setForm({ ...form, category_name: e.target.value })} className="rounded-xl" placeholder="e.g. Attar, Oud, Inspired" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl" placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMsg || `This will permanently delete "${deleting?.category_name}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            {!deleteMsg && (
              <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
