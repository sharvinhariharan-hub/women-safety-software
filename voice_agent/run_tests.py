"""Run all voice tests with external socket access blocked."""
import ipaddress
import socket
import sys
import unittest

attempts = []
original_connect = socket.socket.connect
original_connect_ex = socket.socket.connect_ex
original_lookup = socket.getaddrinfo


def check(host):
    if host in ('localhost', b'localhost', None):
        return
    try:
        if ipaddress.ip_address(host).is_loopback:
            return
    except ValueError:
        pass
    attempts.append('blocked')
    raise OSError('Voice test safety guard blocked external networking')


def connect(self, address):
    if self.family in (socket.AF_INET, socket.AF_INET6):
        check(address[0])
    return original_connect(self, address)


def connect_ex(self, address):
    if self.family in (socket.AF_INET, socket.AF_INET6):
        check(address[0])
    return original_connect_ex(self, address)


def lookup(host, *args, **kwargs):
    check(host)
    return original_lookup(host, *args, **kwargs)


if __name__ == '__main__':
    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex
    socket.getaddrinfo = lookup
    suite = unittest.defaultTestLoader.discover('voice_agent/tests')
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if attempts:
        print('Unexpected external network attempt was blocked.', file=sys.stderr)
    sys.exit(0 if result.wasSuccessful() and not attempts else 1)
