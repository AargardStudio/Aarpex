import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { Users, Plus, Search, Mail, Phone, Building2, ExternalLink } from "lucide-react";

export const ContactsView: React.FC = () => {
  const { contacts, companies, setSelectedCompanyId, setQuickCreateOpen, setQuickCreateType } = useCRM();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredContacts = contacts.filter((cnt) => {
    const comp = companies.find((c) => c.id === cnt.companyId);
    const matchesSearch =
      `${cnt.firstName} ${cnt.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cnt.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cnt.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (comp && comp.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div id="contacts-view" className="space-y-5 animate-in fade-in duration-200">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search contacts by name, role, email, company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
          />
        </div>

        <button
          onClick={() => {
            setQuickCreateType("contact");
            setQuickCreateOpen(true);
          }}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm self-end sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Contact</span>
        </button>
      </div>

      {/* Contacts Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">
              <tr>
                <th className="p-3.5">Name</th>
                <th className="p-3.5">Title / Role</th>
                <th className="p-3.5">Company</th>
                <th className="p-3.5">Email</th>
                <th className="p-3.5">Phone</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 whitespace-nowrap">
              {filteredContacts.map((cnt) => {
                const comp = companies.find((c) => c.id === cnt.companyId);
                return (
                  <tr key={cnt.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">
                        {cnt.firstName} {cnt.lastName}
                      </div>
                      <div className="text-[11px] text-slate-400">Rep: {cnt.salesperson}</div>
                    </td>

                    <td className="p-3.5 text-slate-700">{cnt.position}</td>

                    <td className="p-3.5">
                      {comp ? (
                        <button
                          onClick={() => setSelectedCompanyId(comp.id)}
                          className="font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{comp.name}</span>
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="p-3.5">
                      <a href={`mailto:${cnt.email}`} className="text-slate-700 hover:text-indigo-600 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{cnt.email}</span>
                      </a>
                    </td>

                    <td className="p-3.5 text-slate-600">
                      {cnt.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{cnt.phone}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {cnt.status}
                      </span>
                    </td>

                    <td className="p-3.5 text-right">
                      {comp && (
                        <button
                          onClick={() => setSelectedCompanyId(comp.id)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-semibold rounded text-xs"
                        >
                          View Account
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
