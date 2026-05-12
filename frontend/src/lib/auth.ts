export function isAuthenticated(): boolean {
    return sessionStorage.getItem('demo-auth') === '1' || localStorage.getItem('demo-remember') === '1'
}
export function logout() {
    sessionStorage.removeItem('demo-auth')
    localStorage.removeItem('demo-remember')
}