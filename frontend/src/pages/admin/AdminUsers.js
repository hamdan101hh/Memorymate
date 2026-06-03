import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Pick } from "../caregiver/CgReminders";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Loader2, Power } from "lucide-react";
import { toast } from "sonner";

export default function AdminUsers() {
  const [users, setUsers] = useState(null);
  const load = () => api.get("/admin/users").then(({ data }) => setUsers(data));
  useEffect(() => { load(); }, []);

  const changeRole = async (u, role) => {
    try { await api.patch(`/admin/users/${u.id}`, { role }); toast.success("Role updated"); load(); }
    catch { toast.error("Could not update"); }
  };
  const toggleActive = async (u) => {
    try { await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active }); toast.success(u.is_active ? "Deactivated" : "Activated"); load(); }
    catch { toast.error("Could not update"); }
  };

  if (!users) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="admin-users-page">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">Users</h1>
      <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Email</TableHead>
              <TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} data-testid="admin-user-row">
                <TableCell className="font-medium">{u.full_name}</TableCell>
                <TableCell className="text-stone-500">{u.email}</TableCell>
                <TableCell>
                  <div className="w-32"><Pick label="" value={u.role} onChange={(r) => changeRole(u, r)} options={["patient", "caregiver", "admin"]} /></div>
                </TableCell>
                <TableCell>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${u.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => toggleActive(u)} className="rounded-lg" data-testid="toggle-active-btn">
                    <Power className="w-4 h-4 mr-1" /> {u.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
