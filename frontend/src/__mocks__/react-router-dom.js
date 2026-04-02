module.exports = {
  useNavigate: () => jest.fn(),
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null }),
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  BrowserRouter: ({ children }) => <>{children}</>,
  Routes: ({ children }) => <>{children}</>,
  Route: () => null,
  MemoryRouter: ({ children }) => <>{children}</>,
};
