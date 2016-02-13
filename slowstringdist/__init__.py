def levenshtein(a, b, delete=1.0, subst=1.0, insert=1.0):
    a = a.encode('ascii', 'ignore')
    b = b.encode('ascii', 'ignore')
    raise NotImplementedError("No slow version of this yet!")
#return 0

def jaccard(a, b, n=2):
    a = a.encode('ascii', 'ignore')
    b = b.encode('ascii', 'ignore')
    A = set([ a[i:i+n] for i in range(len(a)-n+1)])
    B = set([ b[i:i+n] for i in range(len(b)-n+1)])
    return 1 - float(len(A.intersection(B)))/len(A.union(B))

if __name__ == '__main__':
    #print(levenshtein('Mathieu', 'Matthew'))
    print(jaccard('Mathieu', 'Matthew'))