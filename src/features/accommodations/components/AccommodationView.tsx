import type { Accommodation } from '@/domain/accommodation';

export interface AccommodationViewProps {
  accommodation: Accommodation;
}

export function AccommodationView({ accommodation: acc }: AccommodationViewProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6 pb-8 pt-2">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold text-on-surface">{acc.name}</h3>
        <p className="text-sm text-on-surface-variant">
          {acc.service === 'other' ? acc.service_other_label : acc.service} • {acc.status}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-surface-container-low p-4 rounded-xl">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Check-in</span>
          <span className="text-sm text-on-surface font-medium">{acc.checkin}</span>
          {acc.checkin_time && <span className="text-xs text-on-surface-variant">{acc.checkin_time}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Check-out</span>
          <span className="text-sm text-on-surface font-medium">{acc.checkout}</span>
          {acc.checkout_time && <span className="text-xs text-on-surface-variant">{acc.checkout_time}</span>}
        </div>
      </div>

      {(acc.price !== undefined || acc.confirmation || acc.location?.address) && (
        <div className="flex flex-col gap-3">
          {acc.price !== undefined && (
            <div className="flex justify-between items-center py-2 border-b border-outline-variant">
              <span className="text-sm text-on-surface-variant">Price</span>
              <span className="text-sm font-medium">{acc.price} {acc.currency}</span>
            </div>
          )}
          {acc.confirmation && (
            <div className="flex flex-col gap-1 py-2 border-b border-outline-variant">
              <span className="text-sm text-on-surface-variant">Confirmation / Booking ID</span>
              <span className="text-sm font-medium">{acc.confirmation}</span>
            </div>
          )}
          {acc.location?.address && (
            <div className="flex flex-col gap-1 py-2 border-b border-outline-variant">
              <span className="text-sm text-on-surface-variant">Address</span>
              <span className="text-sm">{acc.location.address}</span>
            </div>
          )}
        </div>
      )}

      {acc.url && (
        <div className="flex flex-col gap-1 py-2 border-b border-outline-variant">
          <span className="text-sm text-on-surface-variant">Booking URL</span>
          <a 
            href={acc.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-sm text-primary hover:underline truncate"
          >
            {acc.url}
          </a>
        </div>
      )}

      {acc.notes && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-on-surface">Notes</span>
          <p className="text-sm whitespace-pre-wrap bg-surface-container-lowest p-3 rounded-lg border border-outline-variant">
            {acc.notes}
          </p>
        </div>
      )}

      {acc.attachments && acc.attachments.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-on-surface">Attachments</span>
          <ul className="text-sm space-y-1">
            {acc.attachments.map(a => (
              <li key={a} className="truncate text-primary">{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
