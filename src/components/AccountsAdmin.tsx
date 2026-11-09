"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Trash2, UserCheck } from "lucide-react";
import { api, formatDate, postJson } from "@/lib/api-client";
import { APPROVAL_LABEL, ROLE_LABEL } from "@/lib/constants";
import type { UserDTO } from "@/lib/types";
import { Alert, EmptyState, SecondaryButton, Spinner } from "./ui";
import { useToast } from "./toast";

export function AccountsAdmin({ user }: { user: UserDTO }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<UserDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState<"todos" | UserDTO["role"]>("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | UserDTO["approvalStatus"]>("todos");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ users: UserDTO[] }>("/api/admin/users");
      setAccounts(result.users);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las cuentas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingTutors = useMemo(
    () => (accounts ?? []).filter((a) => a.role === "tutor" && a.approvalStatus === "pending"),
    [accounts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es");
    return (accounts ?? []).filter((a) => {
      if (roleFilter !== "todos" && a.role !== roleFilter) return false;
      if (statusFilter !== "todos" && a.approvalStatus !== statusFilter) return false;
      if (!q) return true;
      return [a.name, a.email, a.cedula ?? "", ROLE_LABEL[a.role], APPROVAL_LABEL[a.approvalStatus]]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(q);
    });
  }, [accounts, roleFilter, statusFilter, search]);

  async function patchAccount(id: number, body: { isActive?: boolean; approvalStatus?: UserDTO["approvalStatus"] }) {
    setBusyId(id);
    setError(null);
    try {
      const { user: updated } = await postJson<{ user: UserDTO }>(`/api/admin/users/${id}`, body, "PATCH");
      setAccounts((prev) => (prev ?? []).map((a) => (a.id === id ? updated : a)));
      toast.success("Cuenta actualizada", `${updated.name} · ${ROLE_LABEL[updated.role]}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar la cuenta.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAccount(account: UserDTO) {
    if (account.role === "administrador") return;
    const confirmed = window.confirm(
      `¿Eliminar la cuenta de ${account.name} (${account.email})? ` +
        (account.role === "estudiante"
          ? "Se eliminarán también sus proyectos y archivos asociados. La auditoría se conserva."
          : "Sus proyectos asignados quedarán sin tutor. La auditoría se conserva.")
    );
    if (!confirmed) return;
    setBusyId(account.id);
    setError(null);
    try {
      await api(`/api/admin/users/${account.id}`, { method: "DELETE" });
      setAccounts((prev) => (prev ?? []).filter((a) => a.id !== account.id));
      toast.success("Cuenta eliminada", account.email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar la cuenta.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Cuentas y solicitudes de tutor</h2>
          <p className="text-sm text-muted mt-1">
            Aprueba solicitudes de tutor, activa/desactiva cuentas y elimina cuentas de estudiante o tutor.
          </p>
        </div>
        <SecondaryButton size="sm" icon={<RefreshCw size={13} />} onClick={load} loading={loading}>
          Actualizar
        </SecondaryButton>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {pendingTutors.length > 0 && (
        <div className="card-flat p-4 border-amber-500/30">
          <p className="text-sm font-semibold text-ink flex items-center gap-2">
            <UserCheck size={15} className="text-amber-500" /> Solicitudes de tutor pendientes ({pendingTutors.length})
          </p>
          <div className="mt-3 space-y-2">
            {pendingTutors.map((tutor) => (
              <div key={tutor.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-app px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{tutor.name}</p>
                  <p className="truncate text-xs text-muted">{tutor.email} · {tutor.emailVerified ? "Correo verificado" : "Correo sin verificar"}</p>
                </div>
                <div className="flex gap-2">
                  <SecondaryButton size="sm" tone="success" loading={busyId === tutor.id} onClick={() => void patchAccount(tutor.id, { approvalStatus: "approved" })}>
                    Aprobar
                  </SecondaryButton>
                  <SecondaryButton size="sm" tone="danger" loading={busyId === tutor.id} onClick={() => void patchAccount(tutor.id, { approvalStatus: "rejected" })}>
                    Rechazar
                  </SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-flat p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted">Buscar</span>
          <input className="input-base" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, correo o cédula..." />
        </label>
        <label className="space-y-1">
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted">Tipo de cuenta</span>
          <select className="select-base" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}>
            <option value="todos">Todos</option>
            <option value="estudiante">Estudiantes</option>
            <option value="tutor">Tutores</option>
            <option value="administrador">Administrador</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted">Aprobación</span>
          <select className="select-base" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="todos">Todas</option>
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobadas</option>
            <option value="rejected">Rechazadas</option>
          </select>
        </label>
      </div>

      {accounts === null ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="card p-8">
          <EmptyState icon={<UserCheck size={34} />} titulo="No hay cuentas en esta categoría" />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card2 text-left text-[0.68rem] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Cuenta</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Aprobación</th>
                <th className="px-4 py-3">Creada</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((account) => (
                <tr key={account.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{account.name}</p>
                    <p className="text-xs text-muted">{account.email}</p>
                    <p className="text-xs text-muted2">{account.cedula ?? "Sin cédula"}{account.phone ? ` · ${account.phone}` : ""}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{ROLE_LABEL[account.role]}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${account.isActive ? "text-emerald-500" : "text-amber-500"}`}>
                      {account.isActive ? "Activa" : "Inactiva"}
                    </span>
                    <p className="text-xs text-muted2">{account.emailVerified ? "Correo verificado" : "Correo sin verificar"}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{APPROVAL_LABEL[account.approvalStatus]}</td>
                  <td className="px-4 py-3 text-xs text-muted">{formatDate(account.createdAt)}</td>
                  <td className="px-4 py-3">
                    {account.role === "administrador" || account.id === user.id ? (
                      <p className="text-right text-xs text-muted2">Protegida</p>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2">
                        {account.role === "tutor" && account.approvalStatus !== "approved" && (
                          <SecondaryButton size="sm" tone="success" disabled={busyId !== null} loading={busyId === account.id} onClick={() => void patchAccount(account.id, { approvalStatus: "approved" })}>
                            Aprobar
                          </SecondaryButton>
                        )}
                        {account.role === "tutor" && account.approvalStatus === "pending" && (
                          <SecondaryButton size="sm" tone="danger" disabled={busyId !== null} loading={busyId === account.id} onClick={() => void patchAccount(account.id, { approvalStatus: "rejected" })}>
                            Rechazar
                          </SecondaryButton>
                        )}
                        {(account.role === "estudiante" || account.approvalStatus === "approved") && (
                          <SecondaryButton
                            size="sm"
                            tone={account.isActive ? "warning" : "success"}
                            disabled={busyId !== null}
                            loading={busyId === account.id}
                            onClick={() => void patchAccount(account.id, { isActive: !account.isActive })}
                          >
                            {account.isActive ? "Desactivar" : "Activar"}
                          </SecondaryButton>
                        )}
                        <SecondaryButton size="sm" tone="danger" icon={<Trash2 size={12} />} disabled={busyId !== null} loading={busyId === account.id} onClick={() => void deleteAccount(account)}>
                          Eliminar
                        </SecondaryButton>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
