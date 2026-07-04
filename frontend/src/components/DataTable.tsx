interface Props {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export default function DataTable({ title, headers, rows }: Props) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
