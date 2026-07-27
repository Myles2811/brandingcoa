'use client';

import { useMemo, useState } from 'react';

type Role = 'Admin' | 'Manager' | 'Reviewer' | 'Viewer';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  accessLevel: 'Full access';
  status: 'Active' | 'Pending invite';
  lastActive: string;
}

const roleDescriptions: Record<Role, string> = {
  Admin: 'Manage users, settings, scans and evidence outcomes.',
  Manager: 'Review exposure, assign work and export reports.',
  Reviewer: 'Update opportunity status and evidence notes.',
  Viewer: 'Read-only access to dashboards and reports.',
};

const initialMembers: TeamMember[] = [
  { id: '1', name: 'Operations Admin', email: 'admin@commercialservices.org.uk', role: 'Admin', accessLevel: 'Full access', status: 'Active', lastActive: 'Today' },
  { id: '2', name: 'Rebate Reviewer', email: 'reviewer@commercialservices.org.uk', role: 'Reviewer', accessLevel: 'Full access', status: 'Active', lastActive: 'Yesterday' },
  { id: '3', name: 'Finance Manager', email: 'finance@commercialservices.org.uk', role: 'Manager', accessLevel: 'Full access', status: 'Pending invite', lastActive: 'Invite sent' },
];

const systemDefinitions = [
  {
    title: 'Award match confidence',
    summary: 'How confident the scanner is that a public award notice is relevant.',
    rows: [
      ['High match', 'The public award notice strongly matches a Procurement Services/framework award. Buyer, supplier, framework reference or contract wording are strong enough to trust the source match.'],
      ['Medium match', 'The notice is likely relevant, but one or more identifiers are weaker or less explicit.'],
      ['Low match', 'The notice may be relevant, but should be treated cautiously until reviewed.'],
    ],
    note: 'This comes from the external award scanner. It is separate from internal reconciliation evidence.',
  },
  {
    title: 'Evidence quality',
    summary: 'How reliable the internal buyer, supplier and workbook evidence is.',
    rows: [
      ['HIGH evidence', 'Buyer and supplier evidence are present, aligned and there is no meaningful conflict.'],
      ['MEDIUM evidence', 'Enough evidence exists to proceed, but there is ambiguity, partial support, timing uncertainty or missing cycle information.'],
      ['LOW evidence', 'Evidence is missing, conflicting or insufficient for a clean rebate decision.'],
    ],
    note: 'This is why a card can show High match and LOW evidence: the award can be real, while the internal proof is weak.',
  },
  {
    title: 'Framework status',
    summary: 'How the framework reference is checked against the framework register.',
    rows: [
      ['Framework confirmed', 'The framework reference exists in the framework register and was active or expiring at the award/publication date.'],
      ['Framework timing review', 'The framework exists in the register, but the award/publication date may sit outside the expected validity window.'],
      ['Framework not confirmed', 'A framework reference was found, but it is not present in the current framework register.'],
      ['Framework unresolved', 'No framework reference could be resolved from the source award evidence.'],
    ],
    note: 'Unconfirmed or unresolved frameworks are excluded from confirmed missing-rebate totals until manually reviewed.',
  },
  {
    title: 'Opportunity issue types',
    summary: 'The operational reason an opportunity is surfaced.',
    rows: [
      ['Buyer-side issue', 'Supplier evidence exists, but buyer-side CAA/COA or rebate-log evidence is missing or weak.'],
      ['Supplier-side issue', 'Buyer evidence exists, but supplier spend evidence is missing, late, off-cycle or has no reporting cycle.'],
      ['Buyer + supplier missing', 'Both buyer-side evidence and supplier-side evidence are missing or weak.'],
      ['Needs review', 'The evidence is mixed or ambiguous and needs manual interpretation.'],
      ['Framework not confirmed', 'The framework must be checked before the award can count as a confirmed opportunity.'],
      ['On track', 'Evidence suggests no follow-up is needed at this point.'],
    ],
    note: 'These labels drive prioritisation on the Opportunities page.',
  },
  {
    title: 'Review statuses',
    summary: 'The manual workflow status applied by dashboard users.',
    rows: [
      ['New', 'Not yet looked at.'],
      ['Acknowledged', 'Seen but not actively worked yet.'],
      ['In review', 'Evidence is being checked.'],
      ['Outreach sent', 'Waiting for buyer or supplier response.'],
      ['Resolved', 'Action complete.'],
      ['Not relevant', 'Dismissed from active work.'],
    ],
    note: 'These are user workflow statuses and can change as the team works the opportunity.',
  },
  {
    title: 'Due-now rebate',
    summary: 'The rebate amount currently treated as requiring action.',
    rows: [
      ['Due now', 'Uses a manual override where present, otherwise expected rebate or lifetime rebate estimate if the opportunity is actionable and due.'],
      ['Not due now', 'Set to zero when an award is on track, not due yet, or the framework is not confirmed.'],
    ],
    note: 'Due-now rebate is designed for operational prioritisation, not final finance posting.',
  },
];

function SettingCard({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div>
        <h3 className="text-sm font-semibold text-[#101828]">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-[#667085]">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusPill({ status }: { status: TeamMember['status'] }) {
  const style = status === 'Active'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-amber-200 bg-amber-50 text-amber-900';
  return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${style}`}>{status}</span>;
}

export default function SettingsTab() {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('Reviewer');

  const pendingInvites = useMemo(() => members.filter(member => member.status === 'Pending invite').length, [members]);
  const admins = useMemo(() => members.filter(member => member.role === 'Admin').length, [members]);

  const sendInvite = () => {
    const email = inviteEmail.trim();
    const typedName = inviteName.trim();
    if (!email) return;
    const fallbackName = email.split('@')[0]?.replace(/[._-]/g, ' ') || 'Invited user';
    setMembers(current => [
      {
        id: crypto.randomUUID(),
        name: (typedName || fallbackName).replace(/\b\w/g, character => character.toUpperCase()),
        email,
        role: inviteRole,
        accessLevel: 'Full access',
        status: 'Pending invite',
        lastActive: 'Invite queued',
      },
      ...current,
    ]);
    setInviteName('');
    setInviteEmail('');
  };

  return (
    <div className="space-y-4 text-[#101828]">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#667085]">
          Manage user invitations, roles and platform access.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[#E1E7F0] bg-white p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase text-[#667085]">Team members</p>
          <p className="mt-2 text-base font-semibold">{members.length}</p>
          <p className="mt-1 text-xs text-[#667085]">{pendingInvites} pending invite{pendingInvites === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-xl border border-[#E1E7F0] bg-white p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase text-[#667085]">Admins</p>
          <p className="mt-2 text-base font-semibold">{admins}</p>
          <p className="mt-1 text-xs text-[#667085]">Can manage users and platform settings</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SettingCard
          title="User access"
          description="Invite users into the platform and assign their role before they create an account."
        >
          <div className="grid gap-2 md:grid-cols-[0.8fr_1fr_180px_auto]">
            <input
              aria-label="Invite username"
              value={inviteName}
              onChange={event => setInviteName(event.target.value)}
              placeholder="Username"
              className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none placeholder:text-[#98A2B3] focus:border-[#2A64FF]"
            />
            <input
              aria-label="Invite email"
              value={inviteEmail}
              onChange={event => setInviteEmail(event.target.value)}
              placeholder="name@organisation.co.uk"
              className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none placeholder:text-[#98A2B3] focus:border-[#2A64FF]"
            />
            <select
              aria-label="Invite role"
              value={inviteRole}
              onChange={event => setInviteRole(event.target.value as Role)}
              className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]"
            >
              {Object.keys(roleDescriptions).map(role => <option key={role}>{role}</option>)}
            </select>
            <button
              type="button"
              onClick={sendInvite}
              className="h-9 rounded-md bg-[#2A64FF] px-3 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(42,100,255,0.24)] transition hover:bg-[#1D4FE8]"
            >
              Send invite
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-[#E1E7F0]">
            <table className="w-full min-w-[820px]">
              <thead className="bg-[#F8FAFD]">
                <tr>{['Username', 'Email address', 'Role', 'Access level', 'Status', ''].map(heading => <th key={heading} className="border-b border-[#E1E7F0] px-3 py-2.5 text-left text-xs font-semibold uppercase text-[#667085]">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.id} className="border-b border-[#EEF2F7] last:border-0">
                    <td className="px-3 py-3">
                      <p className="text-sm font-semibold">{member.name}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-[#667085]">{member.email}</td>
                    <td className="px-3 py-3">
                      <select
                        aria-label={`Role for ${member.email}`}
                        value={member.role}
                        onChange={event => setMembers(current => current.map(row => row.id === member.id ? { ...row, role: event.target.value as Role } : row))}
                        className="h-8 rounded-md border border-[#D0D5DD] bg-white px-2 text-xs text-[#101828] outline-none focus:border-[#2A64FF]"
                      >
                        {Object.keys(roleDescriptions).map(role => <option key={role}>{role}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex whitespace-nowrap rounded-md border border-[#B8C7FF] bg-[#EEF3FF] px-2 py-1 text-xs font-semibold text-[#0B1F4D]">{member.accessLevel}</span>
                    </td>
                    <td className="px-3 py-3"><StatusPill status={member.status} /></td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" className="rounded-md border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] transition hover:bg-[#F8FAFC]">
                        {member.status === 'Pending invite' ? 'Resend' : 'Manage'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingCard>

        <SettingCard
          title="Roles"
          description="Keep permissions simple and aligned to the rebate operating model."
        >
          <div className="space-y-2">
            {Object.entries(roleDescriptions).map(([role, description]) => (
              <div key={role} className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-3">
                <p className="text-xs font-semibold text-[#101828]">{role}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#667085]">{description}</p>
              </div>
            ))}
          </div>
        </SettingCard>
      </div>

      <SettingCard
        title="System definitions"
        description="Read-only guide to the labels and confidence levels shown across the dashboard."
      >
        <div className="grid gap-2">
          {systemDefinitions.map(definition => (
            <details key={definition.title} className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD]">
              <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-[#101828]">
                {definition.title}
                <span className="ml-2 text-xs font-normal text-[#667085]">{definition.summary}</span>
              </summary>
              <div className="border-t border-[#E1E7F0] bg-white px-3 py-3">
                <div className="grid gap-2">
                  {definition.rows.map(([label, description]) => (
                    <div key={label} className="grid gap-1 rounded-md border border-[#E1E7F0] bg-[#F8FAFD] px-3 py-2 sm:grid-cols-[180px_1fr]">
                      <p className="text-xs font-semibold text-[#0B1F4D]">{label}</p>
                      <p className="text-xs leading-relaxed text-[#667085]">{description}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 rounded-md border border-[#D9E5FF] bg-[#F6F9FF] px-3 py-2 text-xs leading-relaxed text-[#475467]">{definition.note}</p>
              </div>
            </details>
          ))}
        </div>
      </SettingCard>
    </div>
  );
}
